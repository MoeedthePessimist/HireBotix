import type { HttpContext } from '@adonisjs/core/http'
import { chatModel, embeddings } from '#config/langchain'
import { pc, pcIndex } from '#config/pinecone'
import fs from 'node:fs'
import env from '#start/env'
import { Document } from '@langchain/core/documents'
import { OpenAIEmbeddings } from '@langchain/openai'
import { VectorDBQAChain } from 'langchain/chains'
import { PineconeStore } from '@langchain/pinecone'

export default class QuestionsController {
  async index({ response }: HttpContext) {
    const file = fs.readFileSync('questions.json', 'utf8')
    const existingQuestions = await JSON.parse(file)

    return response.json({
      questions: existingQuestions,
    })
  }

  async generate({ response }: HttpContext) {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    console.log(vectorStore)

    response.status(200).json({
      message: 'Generated!',
    })
  }

  async store({ response }: HttpContext) {
    const file = fs.readFileSync('questions.json', 'utf8')
    const existingQuestions = await JSON.parse(file)

    const documents = existingQuestions.map((question: { difficulty: string; problem: string }) => {
      return new Document({
        pageContent: question.problem,
        metadata: {
          difficulty: question.difficulty,
        },
      })
    })

    const vectors = await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex: pcIndex,
    })

    return response.json({
      vectors,
    })
  }
}
