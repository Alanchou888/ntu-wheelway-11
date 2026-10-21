import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'

const root=createRoot(document.getElementById('root')!)
if(import.meta.env.DEV&&window.location.pathname==='/__location-test'){
  void import('./LocationLab').then(({default:LocationLab})=>root.render(<StrictMode><LocationLab/></StrictMode>))
}else root.render(<StrictMode><App /></StrictMode>)
