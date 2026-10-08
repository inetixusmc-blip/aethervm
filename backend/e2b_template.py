"""Build the actual Ubuntu 24.04 E2B Desktop template, once per organization."""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()
from e2b_provider import TEMPLATE, settings

def definition():
    from e2b import Template
    return Template().from_dockerfile(str(Path(__file__).with_name('Dockerfile.e2b')))

def ensure_template():
    from e2b import Template
    options=settings()
    alias=os.getenv('E2B_TEMPLATE') or TEMPLATE
    if Template.exists(alias, **options):
        print('E2B Ubuntu template already exists: '+alias,flush=True)
        return
    print('Building E2B Ubuntu 24.04 desktop template. The first build takes several minutes.',flush=True)
    # Default E2B Hobby sizing; no dependency on custom-compute plan features.
    Template.build(definition(),alias=alias,**options)
    print('E2B Ubuntu template ready: '+alias,flush=True)

if __name__=='__main__':
    try: ensure_template()
    except Exception as exc:
        print('E2B template setup failed: '+type(exc).__name__+'. Check the server E2B key, template build and credits.',flush=True)
        raise SystemExit(1)
