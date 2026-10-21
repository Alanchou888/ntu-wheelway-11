import {useEffect,useMemo,useState} from 'react'
import {fetchSnapshot} from './data-client'
import {fallbackPlaces,parsePlaceCatalog} from './places'
import type {Campus,PlaceCatalog} from './types'

export function usePlaceCatalog(campus:Campus|null){
  const [data,setData]=useState<PlaceCatalog|null>(null)
  const [error,setError]=useState(false)
  const [loading,setLoading]=useState(true)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError(false)
    fetchSnapshot('/data/places.json',parsePlaceCatalog,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(()=>{if(!controller.signal.aborted)setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[attempt])
  const catalog=useMemo(()=>data??(campus?fallbackPlaces(campus):null),[data,campus])
  return{catalog,error,loading,retry:()=>setAttempt(n=>n+1)}
}
