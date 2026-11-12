import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'

const root=createRoot(document.getElementById('root')!)
if(import.meta.env.DEV && import.meta.env.MODE === 'team' && /^\/team\/?$/.test(window.location.pathname)){
  void import('./TeamApp').then(({default:TeamApp})=>root.render(<StrictMode><TeamApp/></StrictMode>))
}else if(import.meta.env.DEV&&window.location.pathname==='/__location-test'){
  void import('./LocationLab').then(({default:LocationLab})=>root.render(<StrictMode><LocationLab/></StrictMode>))
}else root.render(<StrictMode><App /></StrictMode>)
