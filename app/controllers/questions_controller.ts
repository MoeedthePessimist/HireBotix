import type { HttpContext } from '@adonisjs/core/http'
import QuestionService from '#services/question_service'
import { inject } from '@adonisjs/core'

@inject()
export default class QuestionsController {
  constructor(protected questionService: QuestionService) {}

  async generate({ request, response }: HttpContext) {
    const { difficulty } = request.qs()

    const result = await this.questionService.generate(difficulty)

    response.status(200).json({
      message: 'Generated!',
      result,
    })
  }

  async analyze({ request, response }: HttpContext) {
    const room = request.qs().room

    const result = await this.questionService.analyze(room)

    return response.json({
      result,
    })
  }

  async store({ response }: HttpContext) {
    const vectors = await this.questionService.store()

    return response.json({
      vectors,
    })
  }
}
