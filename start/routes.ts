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
router.post('/questions/store', [QuestionsController, 'store'])
router.get('/questions/vector-agent', [QuestionsController, 'vectorAgent'])
router.get('/questions/structured-chat-agent', [QuestionsController, 'structuredChatAgent'])
