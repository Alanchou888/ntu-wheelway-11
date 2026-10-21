import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { buildOffline } from './build-offline.mjs'

await buildOffline({ directory: 'dist/client' })
await mkdir('dist/server', { recursive: true })
await build({ entryPoints: ['server/index.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none' })
await writeFile('dist/server/wrangler.json', JSON.stringify({
  name: 'ntu-wheelway-community', main: 'index.js', compatibility_date: '2026-05-15',
  assets: { directory: '../client', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
  d1_databases: [{ binding: 'DB', database_name: 'wheelway-community', database_id: '00000000-0000-4000-8000-000000000000' }],
  r2_buckets: [{ binding: 'BUCKET', bucket_name: 'wheelway-community-photos' }],
}, null, 2))
console.log('Community Worker and offline client built.')
