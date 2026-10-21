import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'))
let applied={}
try{applied=JSON.parse(await readFile('.wrangler/community-migrations.json','utf8'))}catch{}
for(const entry of journal.entries){
  const file=`drizzle/${entry.tag}.sql`
  const hash=createHash('sha256').update(await readFile(file)).digest('hex')
  if(applied[file]){if(applied[file]!==hash)throw new Error(`Applied migration changed: ${file}`);continue}
  const child=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'}})
  if(child.status!==0)process.exit(child.status??1)
  applied[file]=hash
  await writeFile('.wrangler/community-migrations.json',JSON.stringify(applied,null,2))
}
console.log('Local community migrations are up to date.')
