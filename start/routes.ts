/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const QuestionsController = () => import('#controllers/questions_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.post('/questions', [QuestionsController, 'generate'])
// router.post('/questions', [QuestionsController, 'store'])
router.post('/questions/analyze', [QuestionsController, 'analyze'])
