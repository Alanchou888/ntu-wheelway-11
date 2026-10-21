import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const previewDirectory=resolve('.sites-local/community-preview')
mkdirSync(previewDirectory,{recursive:true})
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'))
config.main=resolve('dist/server/index.js');config.assets.directory=resolve('dist/client')
writeFileSync(resolve(previewDirectory,'wrangler.json'),JSON.stringify(config,null,2))
const localEnv=existsSync('.env.local')?readFileSync('.env.local','utf8'):''
const admin=localEnv.split(/\r?\n/).find(line=>line.startsWith('COMMUNITY_ADMIN_TOKEN='))??''
writeFileSync(resolve(previewDirectory,'.dev.vars'),admin+'\n')
const args=['node_modules/wrangler/bin/wrangler.js','dev','--config',resolve(previewDirectory,'wrangler.json'),'--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','8787','--inspector-port','0']
args.push(...process.argv.slice(2))
const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'}})
child.on('exit',code=>{process.exitCode=code??1})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
