import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import TermsView from '../views/TermsView.vue'

export const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/terms', name: 'terms', component: TermsView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
]

/** L'historique est injectable pour que les tests utilisent `createMemoryHistory()`. */
export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes })
}
