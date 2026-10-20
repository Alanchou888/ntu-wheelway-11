import { useEffect, useState } from 'react'
import type { Campus, SurveyData } from './types'
import { loadCampus, loadSurvey } from './data-client'

export function useCampusData() {
  const [campus, setCampus] = useState<Campus | null>(null)
  const [survey, setSurvey] = useState<SurveyData>({ version: 1, routes: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [surveyLoading, setSurveyLoading] = useState(true)
  const [surveyError, setSurveyError] = useState(false)
  const [campusAttempt, setCampusAttempt] = useState(0)
  const [surveyAttempt, setSurveyAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(false)
    loadCampus(controller.signal).then(data => { if (!controller.signal.aborted) setCampus(data) }).catch(() => { if (!controller.signal.aborted) setLoadError(true) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [campusAttempt])
  useEffect(() => {
    const controller = new AbortController()
    setSurveyLoading(true); setSurveyError(false)
    loadSurvey(controller.signal).then(data => { if (!controller.signal.aborted) setSurvey(data) }).catch(() => { if (!controller.signal.aborted) { setSurvey({ version: 1, routes: [] }); setSurveyError(true) } }).finally(() => { if (!controller.signal.aborted) setSurveyLoading(false) })
    return () => controller.abort()
  }, [surveyAttempt])
  return { campus, survey, loading, loadError, surveyLoading, surveyError, retryCampus: () => setCampusAttempt(n => n + 1), retrySurvey: () => setSurveyAttempt(n => n + 1) }
}
