"""Only text/image reasoning models that can drive our function tools."""
CATALOG = [
    {'id': 'gemini-3.8-flash', 'name': 'Gemini 3.8 Flash', 'description': 'Fast everyday work'},
    {'id': 'gemini-3.1-pro-preview', 'name': 'Gemini 3.1 Pro', 'description': 'Complex reasoning · preview'},
    {'id': 'gemini-2.5-flash', 'name': 'Gemini 2.5 Flash', 'description': 'Previous generation'},
    {'id': 'gemini-2.5-pro', 'name': 'Gemini 2.5 Pro', 'description': 'Previous generation reasoning'},
]

def available_models(client):
    available = {m.name.removeprefix('models/') for m in client.models.list()
                 if m.name and 'generateContent' in (m.supported_actions or [])}
    return [m for m in CATALOG if m['id'] in available]
