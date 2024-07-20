import { chatModel, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import Conversation from '#models/conversation'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { PineconeStore } from '@langchain/pinecone'
import {
  AgentExecutor,
  createOpenAIFunctionsAgent,
  createVectorStoreAgent,
  VectorStoreInfo,
  VectorStoreToolkit,
} from 'langchain/agents'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { Document } from 'langchain/document'
import { JSONLoader } from 'langchain/document_loaders/fs/json'
import { ChainTool, DynamicTool, VectorStoreQATool } from 'langchain/tools'
import { createRetrieverTool } from 'langchain/tools/retriever'
import fs from 'node:fs'

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
    const context = await retriever.invoke(`I want a problem of difficulty: ${difficulty}`, {
      metadata: {
        difficulty: difficulty,
      },
    })

    const contextMessages = context
      .map((document, idx) => `${idx} - ${document.pageContent}`)
      .join('\n')

    const prompt = ChatPromptTemplate.fromMessages(
      [
        [
          'system',
          `${systemMessage}
          <context>
            {context}
          <context>
        `,
        ],
        ['human', `I want a problem of difficulty: {difficulty}`],
        ['placeholder', '{agent_scratchpad}'],
      ],
      {
        outputParser: new StringOutputParser(),
      }
    )

    const retrieverTool = createRetrieverTool(retriever, {
      name: 'generate_new_problem',
      description:
        'Generate a new problem based on the provided difficulty using the provided context. You must use this tool for generating a new question',
      verbose: true,
    })

    const tools = [retrieverTool]

    const agent = await createOpenAIFunctionsAgent({
      llm: chatModel,
      tools,
      prompt,
    })

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
    })

    const result = await agentExecutor.invoke({
      difficulty: difficulty,
      context: contextMessages,
    })

    return result

    // const roomID = this.randNum()

    // // insert the result to the database.
    // const conversation = await Conversation.createMany([
    //   { room: roomID, message: systemMessage, sender: 'System' },
    //   {
    //     room: roomID,
    //     message: difficulty,
    //     sender: 'User',
    //   },
    //   {
    //     room: roomID,
    //     message: result.answer,
    //     sender: 'AI',
    //   },
    // ])

    // return {
    //   result,
    //   // conversation,
    // }
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

    console.log(historyAwarePrompt)

    // const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    //   pineconeIndex: pcIndex,
    // })

    // const retreiver = vectorStore.asRetriever()

    // const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    //   llm: chatModel,
    //   retriever: retreiver,
    //   rephrasePrompt: historyAwarePrompt,
    // })

    // const historyAwareCombineDocsChain = await createStuffDocumentsChain({
    //   llm: chatModel,
    //   prompt: historyAwarePrompt,
    // })

    // const conversationalRetrievalChain = await createRetrievalChain({
    //   retriever: historyAwareRetrieverChain,
    //   combineDocsChain: historyAwareCombineDocsChain,
    // })

    // const result = await conversationalRetrievalChain.invoke({
    //   input: `
    //        ${code}
    //     `,
    // })

    return null
  }

  async store() {
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
    console.log(documents)

    const vectors = await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex: pcIndex,
    })

    return vectors
  }
}
