#!/usr/bin/env python3
"""Owner-only push operations. Supply fresh Sites bearer on hidden stdin, never argv."""
import json,sys,termios,urllib.request,urllib.error
ORIGIN='https://yaqoot-sufyan-erp.beefycup1.chatgpt.site'
settings=termios.tcgetattr(sys.stdin) if sys.stdin.isatty() else None
try:
 if settings:
  hidden=settings.copy();hidden[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
 print('Ready for private operation JSON on stdin (input is hidden).',flush=True)
 data=json.loads(sys.stdin.readline())
finally:
 if settings:termios.tcsetattr(sys.stdin,termios.TCSANOW,settings)
action=data.get('action','status')
if action not in ('status','send','assets'):raise SystemExit('Unsupported operation')
headers={'OAI-Sites-Authorization':'Bearer '+data['token'],'X-Yaqoot-Operation':'owner-push'}
paths=['/sw.js','/manifest.webmanifest'] if action=='assets' else ['/api/push/'+action]
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
for path in paths:
 payload=None
 if action=='send':
  payload=json.dumps({**{k:data[k] for k in ('requestId','title','body')},'count':data.get('count',1)},ensure_ascii=False).encode();headers['Content-Type']='application/json'
 req=urllib.request.Request(ORIGIN+path,data=payload,headers=headers)
 try:
  with opener.open(req,timeout=90) as response:
   body=response.read();ctype=response.headers.get('Content-Type','')
   result=json.loads(body) if 'application/json' in ctype and action!='assets' else {'path':path,'status':response.status,'content_type':ctype,'bytes':len(body)}
   print(json.dumps(result,ensure_ascii=False))
 except urllib.error.HTTPError as exc:
  body=exc.read();print(json.dumps({'status':exc.code,'error':json.loads(body) if 'application/json' in exc.headers.get('Content-Type','') else 'Unexpected response'},ensure_ascii=False));sys.exit(1)
