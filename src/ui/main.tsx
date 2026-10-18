import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={150}>
        <App />
      </Tooltip.Provider>
    </MotionConfig>
  </StrictMode>,
)
