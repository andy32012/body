import { createContext, useContext } from 'react'
import type { AstroPhoto } from '../lib/cosmos'
import RotatingPhoto from './RotatingPhoto'

export const SceneFeatureContext = createContext<AstroPhoto | undefined>(undefined)
export const useSceneFeature = () => useContext(SceneFeatureContext)

export default function ScenePhoto({className}: {className: string}) {
  const photo = useSceneFeature()
  return photo ? <RotatingPhoto className={className} photo={photo}/> : null
}
