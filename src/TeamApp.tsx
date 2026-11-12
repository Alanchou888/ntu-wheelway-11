import { ClipboardCheck, Download } from 'lucide-react'
import SurveyEditor from './SurveyEditor'
import { useCampusData } from './useCampusData'
import csvTemplate from '../docs/templates/field-survey.csv?url'
import jsonTemplate from '../docs/templates/survey-template.json?url'

export default function TeamApp() {
  const { campus, loading, retryCampus } = useCampusData()
  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-symbol"><ClipboardCheck size={25} aria-hidden="true" /></span><span><strong>第 11 組實勘工具</strong><small>本機團隊入口</small></span></div>
      <nav className="product-nav" aria-label="實勘範本">
        <a className="button secondary" href={csvTemplate} download="field-survey.csv"><Download size={16} aria-hidden="true" />空白 CSV</a>
        <a className="button secondary" href={jsonTemplate} download="survey-template.json"><Download size={16} aria-hidden="true" />空白 JSON</a>
      </nav>
    </header>
    {campus ? <SurveyEditor campus={campus} onClose={() => location.assign('/')} /> : <main className="app-loading">
      <h1>{loading ? '載入實勘工具' : '校園資料無法載入'}</h1>
      {!loading && <button className="button primary" onClick={retryCampus}>重新載入</button>}
    </main>}
  </div>
}
