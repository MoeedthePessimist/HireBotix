import type { HttpContext } from '@adonisjs/core/http'
import { chatModel } from '#config/langchain'
import { pc } from '#config/pinecone'

export default class QuestionsController {
  async index(ctx: HttpContext) {
    const data = await chatModel.invoke('what is LangSmith?')
    ctx.response.send(data)
  }

  async createIndex(ctx: HttpContext) {
    await pc.createIndex({
      name: 'quickstart',
      dimension: 8, // Replace with your model dimensions
      metric: 'euclidean', // Replace with your model metric
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    })

    ctx.response.send('Index created')
  }
}
