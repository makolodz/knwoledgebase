/// <reference types="vite/client" />

// Nécessaire à ESLint (analyse typée), qui ne sait pas lire les fichiers .vue. `vue-tsc` n'en a
// pas besoin : il résout les vrais composants.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
