import { ChatOpenAI } from '@langchain/openai'
import env from '#start/env'

export const chatModel = new ChatOpenAI({
  apiKey: env.get('OPENAI_API_KEY'),
})
