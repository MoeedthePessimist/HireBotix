import { chatModel, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { PineconeStore } from '@langchain/pinecone'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { Document } from 'langchain/document'
import { JSONLoader } from 'langchain/document_loaders/fs/json'
import fs from 'node:fs'

export default class QuestionService {
  async generate(difficulty: string) {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    // const retriever = vectorStore.asRetriever({
    //   metadata: {
    //     difficulty,
    //   },
    // })
    const retriever = vectorStore.asRetriever()

    const prompt =
      ChatPromptTemplate.fromTemplate(`Generate new coding problem based on the provided difficulty and context:

        <context>
        {context}
        </context>

        Difficulty: {input}
    `)

    const documentChain = await createStuffDocumentsChain({
      llm: chatModel,
      prompt,
    })

    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain: documentChain,
    })

    const result = await retrievalChain.invoke({
      input: difficulty,
    })

    return result
  }

  async store() {
    const loader = new JSONLoader('questions.json')

    const docs = await loader.load()

    const vectors = await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: pcIndex,
    })

    return vectors
  }
}
