import { communityApi } from './community'
import type { CommunityEnv } from './community'
import { buildDemoRoutes } from '../src/routes'
import campus from '../public/data/campus.json'
import survey from '../public/data/surveyed-routes.json'
import type { Campus, SurveyData } from '../src/types'

const segments = [...buildDemoRoutes(campus as unknown as Campus),...(survey as SurveyData).routes].flatMap(route => route.segments)
const ids = new Set(segments.map(segment => segment.id))
const lines = new Map(segments.map(segment => [segment.id, segment.coordinates]))
interface Env extends CommunityEnv { ASSETS: { fetch(request: Request): Promise<Response> } }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/community/')) return communityApi(request,env,ids,lines)
    return env.ASSETS.fetch(request)
  },
}
