"""Provider detection and Vercel's fixed-host Chat Completions transport.

The shared worker owns all actions; this adapter only translates model traffic.
No key probing against multiple services, redirect following, or key persistence.
"""
import base64
import json
from types import SimpleNamespace
import httpx
from google.genai import types

GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1'
# A small set of vision + function-calling models, checked against live metadata.
GATEWAY_CATALOG = [
    ('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5'),
    ('anthropic/claude-sonnet-5', 'Claude Sonnet 5'),
    ('openai/gpt-6.1-sol', 'GPT 6.1 Sol'),
    ('openai/gpt-5.4', 'GPT 5.4'),
    ('google/gemini-3.8-flash', 'Gemini 3.8 Flash'),
    ('google/gemini-2.5-flash', 'Gemini 2.5 Flash'),
]

class ProviderInputError(ValueError):
    pass

class ProviderError(Exception):
    def __init__(self, code, message=''):
        self.code = code
        # Never retain the upstream body (it can contain credentials).
        self.message = ''
        super().__init__('AI provider request failed')

def detect_provider(key):
    key = key.strip()
    if key.startswith('vck_'): return 'vercel'
    if key.startswith('AIza'): return 'gemini'
    raise ProviderInputError('Key not recognized. Paste a Google Gemini API key (AIza…) or Vercel AI Gateway API key (vck_…). Vercel account tokens are not Gateway keys.')

def provider_name(provider):
    return 'Vercel AI Gateway' if provider == 'vercel' else 'Gemini'

def validate_model(provider, model):
    if provider == 'vercel':
        if not model or model not in dict(GATEWAY_CATALOG):
            raise ProviderInputError('Choose an available Vercel AI Gateway model in Settings.')
    elif not model or '/' in model or not model.startswith('gemini-'):
        raise ProviderInputError('Choose an available Gemini model in Settings.')

class GatewayClient:
    provider = 'vercel'
    def __init__(self, api_key, timeout):
        self.http = httpx.Client(base_url=GATEWAY_URL+'/', headers={'Authorization':'Bearer '+api_key.strip()}, timeout=timeout/1000, follow_redirects=False)
        self.models = self
        self.raw_content = {}

    def close(self):
        self.raw_content.clear()
        # Drop the key as well as closing network connections.
        self.http.headers.pop('Authorization', None)
        self.http.close()

    def request(self, method, path, **kwargs):
        response = self.http.request(method, path, **kwargs)
        if response.status_code >= 300: raise ProviderError(response.status_code)
        try: return response.json()
        except ValueError: raise ProviderError(502) from None

    def available_models(self):
        items = self.request('GET', 'models').get('data', [])
        available = {}
        for item in items:
            tags = item.get('tags') or []
            modalities = item.get('modalities') or {}
            if (item.get('type') == 'language' and 'tool-use' in tags
                and 'image' in modalities.get('input', []) and 'text' in modalities.get('output', [])):
                available[item['id']] = item
        return [{'id':mid,'name':name,'description':'Computer tools · image input'}
                for mid,name in GATEWAY_CATALOG if mid in available]

    @staticmethod
    def schema(value):
        if isinstance(value, dict):
            return {k:(v.lower() if k == 'type' and isinstance(v,str) else GatewayClient.schema(v)) for k,v in value.items()}
        if isinstance(value, list): return [GatewayClient.schema(v) for v in value]
        return value

    def messages(self, contents, system=None):
        messages = [{'role':'system','content':system}] if system else []
        if isinstance(contents, str): return messages+[{'role':'user','content':contents}]
        for content in contents:
            if id(content) in self.raw_content:
                messages.append(self.raw_content[id(content)])
                continue
            text = []; images = []
            for part in content.parts or []:
                if part.function_response:
                    fr = part.function_response
                    messages.append({'role':'tool','tool_call_id':fr.id,'content':json.dumps(fr.response)})
                elif part.inline_data:
                    images.append({'type':'image_url','image_url':{'url':'data:'+part.inline_data.mime_type+';base64,'+base64.b64encode(part.inline_data.data).decode()}})
                elif part.text and not part.thought: text.append(part.text)
            if text or images:
                role = 'assistant' if content.role == 'model' else 'user'
                payload = '\n'.join(text)
                if images: payload = ([{'type':'text','text':payload}] if payload else [])+images
                messages.append({'role':role,'content':payload})
        return messages

    def generate_content(self, *, model, contents, config):
        validate_model('vercel', model)
        payload = {'model':model,'messages':self.messages(contents,config.system_instruction), 'max_tokens':config.max_output_tokens or 4096, 'stream':False}
        if config.tools:
            payload['tools'] = [{'type':'function','function':{'name':f.name,'description':f.description or '',
                'parameters':self.schema(f.parameters.model_dump(mode='json',exclude_none=True)) if f.parameters else {'type':'object','properties':{}}}}
                for tool in config.tools for f in tool.function_declarations or []]
            payload['tool_choice'] = 'auto'
        response = self.request('POST', 'chat/completions', json=payload)
        try:
            message = response['choices'][0]['message']
            parts = []
            if message.get('content'): parts.append(types.Part(text=message['content']))
            for call in message.get('tool_calls') or []:
                function = call['function']
                args = json.loads(function['arguments'])
                allowed={f.name for tool in config.tools or [] for f in tool.function_declarations or []}
                if not isinstance(args,dict) or not call.get('id') or function['name'] not in allowed: raise ValueError('Invalid tool call')
                parts.append(types.Part(function_call=types.FunctionCall(name=function['name'],args=args,id=call['id'])))
            if not parts: raise ValueError('Empty response')
            content = types.Content(role='model',parts=parts)
            # Keep the original message, including reasoning/signature metadata,
            # for later rounds instead of rebuilding tool calls from display text.
            self.raw_content[id(content)] = message
            return SimpleNamespace(candidates=[SimpleNamespace(content=content)])
        except (KeyError,IndexError,TypeError,ValueError): raise ProviderError(502) from None
