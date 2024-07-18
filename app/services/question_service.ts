import { chatModel, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import Conversation from '#models/conversation'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { PineconeStore } from '@langchain/pinecone'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { JSONLoader } from 'langchain/document_loaders/fs/json'

export default class QuestionService {
  randNum() {
    return Math.floor(Math.random() * 1000)
  }

  async generate(difficulty: string) {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    const retriever = vectorStore.asRetriever()
    const systemMessage = `You are an interviewer who needs to give a coding problem to a candidate. The candidate is a junior developer so you need to test their problem solving skills. Generate a new problem based on the difficulty provided and the existing problems. The context is as follows:`

    const prompt = ChatPromptTemplate.fromTemplate(`${systemMessage}

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

    const roomID = this.randNum()

    // insert the result to the database.
    const conversation = await Conversation.createMany([
      { room: roomID, message: systemMessage, sender: 'System' },
      {
        room: roomID,
        message: difficulty,
        sender: 'User',
      },
      {
        room: roomID,
        message: result.answer,
        sender: 'AI',
      },
    ])

    return {
      result,
      conversation,
    }
  }

  async analyze(room: number, code: string) {
    const conversation = await Conversation.query().where('room', room)

    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `${conversation[0].message}
        <context>
        {context}
        <context>
        `,
      ],
      new HumanMessage(`Difficulty: ${conversation[1].message}`),
      new AIMessage(`${conversation[2].message}`),
      [
        'user',
        `I want you to evaluate my code. Please give me suggestions as how can I make this code better:

        {input}`,
      ],
    ])

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    const retreiver = vectorStore.asRetriever()

    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
      llm: chatModel,
      retriever: retreiver,
      rephrasePrompt: historyAwarePrompt,
    })

    const historyAwareCombineDocsChain = await createStuffDocumentsChain({
      llm: chatModel,
      prompt: historyAwarePrompt,
    })

    const conversationalRetrievalChain = await createRetrievalChain({
      retriever: historyAwareRetrieverChain,
      combineDocsChain: historyAwareCombineDocsChain,
    })

    const result = await conversationalRetrievalChain.invoke({
      input: `
           ${code}
        `,
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
