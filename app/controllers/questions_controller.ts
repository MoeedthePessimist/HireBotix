import type { HttpContext } from '@adonisjs/core/http'
import { chatModel, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import fs from 'node:fs'
import { Document } from '@langchain/core/documents'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { PineconeStore } from '@langchain/pinecone'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { ChatPromptTemplate } from '@langchain/core/prompts'

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

    const retriever = vectorStore.asRetriever()

    const prompt =
      ChatPromptTemplate.fromTemplate(`Generate new coding problem based on the provided difficulty and context:

<context>
{context}
</context>

Difficulty: {input}`)

    const documentChain = await createStuffDocumentsChain({
      llm: chatModel,
      prompt,
    })

    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain: documentChain,
    })

    const result = await retrievalChain.invoke({
      input: 'Hard',
    })

    response.status(200).json({
      message: 'Generated!',
      result,
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
