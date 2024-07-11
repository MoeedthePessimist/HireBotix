import { chatModel, embeddings } from '#config/langchain'
import { pc, pcIndex } from '#config/pinecone'
import Conversation from '#models/conversation'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
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

    const roomID = this.randNum()

    // insert the result to the database.
    // const conversation = await Conversation.createMany([
    //   {
    //     roomID: roomID,
    //     message: prompt as unknown as string,
    //     sender: 'User',
    //   },
    //   {
    //     roomID: roomID,
    //     message: result.answer,
    //     sender: 'AI',
    //   },
    // ])

    return {
      result,
      //   conversation,
    }
  }

  async analyze() {
    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an interviewer who needs to give a coding problem to a candidate. The candidate is a junior developer so you need to test their problem solving skills. After giving them the problem you will have to evaluate their solution. The problem should be based on the given difficulty by the user and the context provided. The context is as follows:
        <context>
        {context}
        </context>
        `,
      ],
      new HumanMessage('Difficulty: easy'),
      new AIMessage('Generate a function that returns the sum of two numbers'),
      ['user', '{input}'],
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
            function sum(a, b) {
                return a + b;
            }
            const result = sum(3, 5);
            console.log(result); // Output: 8
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
