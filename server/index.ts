import { communityApi } from './community'
import type { CommunityEnv } from './community'
import { buildDemoRoutes } from '../src/routes'
import campus from '../public/data/campus.json'
import survey from '../public/data/surveyed-routes.json'
import type { Campus, SurveyData } from '../src/types'

const ids = new Set([...buildDemoRoutes(campus as unknown as Campus),...(survey as SurveyData).routes].flatMap(route=>route.segments.map(segment=>segment.id)))
interface Env extends CommunityEnv { ASSETS: { fetch(request: Request): Promise<Response> } }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/community/')) return communityApi(request,env,ids)
    return env.ASSETS.fetch(request)
  },
}
