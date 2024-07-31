import type { HttpContext } from '@adonisjs/core/http'
import QuestionService from '#services/question_service'
import { inject } from '@adonisjs/core'

@inject()
export default class QuestionsController {
  constructor(protected questionService: QuestionService) {}

  async generate({ request, response }: HttpContext) {
    const { difficulty, queryType, room, category } = request.qs()

    const { code } = request.body()

    const result = await this.questionService.generate(difficulty, queryType, code, room, category)

    response.status(200).json({
      message: 'Generated!',
      result,
    })
  }

  async store({ response }: HttpContext) {
    const vectors = await this.questionService.store()

    return response.json({
      vectors,
    })
  }

  async vectorAgent({ response }: HttpContext) {
    const results = await this.questionService.vectorAgent()
    return response.json({
      results,
    })
  }

  async structuredChatAgent({ response }: HttpContext) {
    const results = await this.questionService.structuredChatAgent()

    return response.json({
      results,
    })
  }
}
