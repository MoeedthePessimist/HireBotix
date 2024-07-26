import { llm, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import Conversation from '#models/conversation'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { PineconeStore } from '@langchain/pinecone'

import { pull } from 'langchain/hub'

import {
  AgentExecutor,
  createOpenAIToolsAgent,
  createStructuredChatAgent,
  createToolCallingAgent,
  createVectorStoreAgent,
  VectorStoreInfo,
  VectorStoreToolkit,
} from 'langchain/agents'
import { createRetrieverTool } from 'langchain/tools/retriever'
import { Document } from 'langchain/document'
import { z } from 'zod'
import fs from 'node:fs'

export default class QuestionService {
  randNum() {
    return Math.floor(Math.random() * 1000)
  }

  getHumanPrompt(queryType: string) {
    const generateQuestionPrompt = `Based on the difficulty level {difficulty}W, generate a new coding question using the existing questions in the vector database. The question should be clear and detailed, including the problem statement, input/output description, and constraints. Also list down which questions you used to generate new problems from the provided vector database`
    const analyzeQuestionPrompt = `Analyze the following code submission for the question in the previous prompt. Provide detailed feedback on its correctness, efficiency, and code quality. Suggest improvements where necessary.
                                   Code:
                                   {code}
                                  `
    const candidateFeedbackPrompt = `Provide feedback on the candidate's overall performance based on the questions they solved as given in this coversation. Mark each of their attempted answers aswell. Highlight their strengths, areas for improvement, and give specific suggestions to help them improve their skills.`
    switch (queryType) {
      case 'Analyze':
        return analyzeQuestionPrompt
      case 'Generate':
        return generateQuestionPrompt

      case 'Feedback':
        return candidateFeedbackPrompt

      default:
        return generateQuestionPrompt
    }
  }

  async generate(difficulty: string, queryType: string, code?: string, room?: number) {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    const retriever = vectorStore.asRetriever()

    let chatHistory: (AIMessage | HumanMessage)[] = []

    if (room) {
      const conversation = await Conversation.query().where('room', room)
      chatHistory = conversation.map((value) => {
        const object =
          value.sender.toLowerCase() === 'ai'
            ? new AIMessage(value.message)
            : new HumanMessage(value.message)

        return object
      })

      console.log(chatHistory)
    }

    const systemMessage = `
      You are a highly knowledgeable and experienced technical interviewer specializing in evaluating coding skills and problem-solving abilities. Your task is to generate new coding questions based on specified difficulty, provide detailed analysis and feedback on code submissions for these questions, and give overall feedback to the candidate on their performance.

      Responsibilities:

      Generate Coding Questions:
      Create new coding questions based on the provided difficulty level.
      Ensure the questions are clear, concise, and cover various topics like algorithms, data structures, system design, etc.
      Take in the embeddings in vector database as context for new question and use the metadata to match the difficulty level in order to get better context.

      Analyze Code Submissions:
      Evaluate the provided code for correctness, efficiency, and best practices.
      Identify potential improvements and provide constructive feedback.
      Highlight any errors or suboptimal code segments with suggestions for improvement.

      Provide Candidate Feedback:
      Offer comprehensive feedback on the candidate's overall performance.
      Highlight strengths, areas for improvement, and provide specific suggestions to help the candidate improve their skills.

      Instructions for Generating Questions:
      Difficulty Levels: Easy, Intermediate, Hard
      Format: Include a problem statement, input/output description, and constraints.
      Context: Embeddings stored in vector database.
      
    
      Instructions for Analyzing Code:
      Correctness: Verify if the code produces the correct output for given inputs.
      Efficiency: Assess the time and space complexity of the code.
      Code Quality: Review the code for readability, maintainability, and adherence to coding standards.

      Feedback: Provide detailed feedback, highlighting strengths and areas for improvement.

      Instructions for Providing Candidate Feedback:
      Context: Use the conversation history as context and the coding problems that you analyzed and based on that provide a detailed feedback.
      Overall Performance: Assess the candidate’s approach to problem-solving and coding.
      Strengths: Highlight what the candidate did well, such as understanding the problem, coding efficiently, or using best practices.
      Areas for Improvement: Identify specific areas where the candidate can improve, such as optimizing code, handling edge cases, or improving code readability.
      Suggestions: Offer actionable advice to help the candidate enhance their skills
    `

    let humanMessage = this.getHumanPrompt(queryType)

    const prompt = ChatPromptTemplate.fromMessages(
      [
        [
          'system',
          `${systemMessage}
        `,
        ],
        ['placeholder', '{chat_history}'],
        ['human', `${humanMessage}`],
        ['placeholder', '{agent_scratchpad}'],
      ],
      {
        outputParser: new StringOutputParser(),
      }
    )

    const retrieverTool = createRetrieverTool(retriever, {
      name: 'retreive_coding_problems',
      description:
        'Provide context for question generation from the vector database. For any generation of new question use this tool to get context for the new question to be generated',
      verbose: true,
    })

    // const questionContextTool = new DynamicStructuredTool({
    //   name: 'question-generation',
    //   description:
    //     'Provide context for question generation from the vector database. For any generation of new question use this tool to get context for the new question to be generated',
    //   schema: z.object({
    //     diff: z.string().describe('The difficulty of the question'),
    //   }),
    //   func: async ({ diff }) => {
    //     return await retriever.invoke('', {
    //       metadata: {
    //         difficulty: diff,
    //       },
    //     })
    //   },
    // })

    const tools = [retrieverTool]

    const promptMessages = await prompt.formatMessages({
      code: code,
      difficulty: difficulty,
      chat_history: chatHistory,
    })

    const agent = await createOpenAIToolsAgent({
      llm: llm,
      tools,
      prompt,
    })

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
    })

    const result = await agentExecutor.invoke(
      queryType === 'Generate'
        ? {
            difficulty: difficulty,
            chat_history: chatHistory,
          }
        : {
            code: code,
            chat_history: chatHistory,
          }
    )

    const roomID = room ? room : this.randNum()

    // insert the result to the database.
    const conversation = await Conversation.createMany([
      {
        room: roomID,
        message: promptMessages[promptMessages.length - 1].content,
        sender: 'User',
      },
      {
        room: roomID,
        message: result.output,
        sender: 'AI',
      },
    ])

    return {
      result,
      conversation,
    }
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

    const vectors = await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex: pcIndex,
    })

    return vectors
  }

  async vectorAgent() {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })

    const vectorStoreInfo: VectorStoreInfo = {
      name: 'difficulty_based_problems',
      description: 'To get the context of existing questions, use this tool',
      vectorStore,
    }

    const toolkit = new VectorStoreToolkit(vectorStoreInfo, llm)

    const agent = createVectorStoreAgent(llm, toolkit)

    const input =
      'Generate a new question of difficulty Easy using the existing questions of the same difficulty'

    const result = await agent.invoke({ input })

    return result
  }

  async structuredChatAgent() {
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: pcIndex,
    })
    const prompt = await pull<ChatPromptTemplate>('hwchase17/structured-chat-agent')
    const retriever = vectorStore.asRetriever()

    const retrieverTool = createRetrieverTool(retriever, {
      name: 'retreive_coding_problems',
      description:
        'Provide context for question generation from the vector database. For any generation of new question use this tool to get context for the new question to be generated',
      verbose: true,
    })

    const tools = [retrieverTool]

    const agent = await createStructuredChatAgent({
      llm,
      tools,
      prompt,
    })

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
    })

    const result2 = await agentExecutor.invoke({
      input:
        'Based on the difficulty level Easy, generate a new coding question using the existing questions. The question should be clear and detailed, including the problem statement, input/output description, and constraints. Also list down which questions you used to generate new problems from the provided vector database',
      chat_history: [
        new SystemMessage(`
                You are a highly knowledgeable and experienced technical interviewer specializing in evaluating coding skills and problem-solving abilities. Your task is to generate new coding questions based on specified difficulty, provide detailed analysis and feedback on code submissions for these questions, and give overall feedback to the candidate on their performance.

                Responsibilities:

                Generate Coding Questions:
                Create new coding questions based on the provided difficulty level.
                Ensure the questions are clear, concise, and cover various topics like algorithms, data structures, system design, etc.
                Take in the embeddings in vector database as context for new question and use the metadata to match the difficulty level in order to get better context.

                Analyze Code Submissions:
                Evaluate the provided code for correctness, efficiency, and best practices.
                Identify potential improvements and provide constructive feedback.
                Highlight any errors or suboptimal code segments with suggestions for improvement.

                Provide Candidate Feedback:
                Offer comprehensive feedback on the candidate's overall performance.
                Highlight strengths, areas for improvement, and provide specific suggestions to help the candidate improve their skills.

                Instructions for Generating Questions:
                Difficulty Levels: Easy, Intermediate, Hard
                Format: Include a problem statement, input/output description, and constraints.
                Context: Embeddings stored in vector database.
                
              
                Instructions for Analyzing Code:
                Correctness: Verify if the code produces the correct output for given inputs.
                Efficiency: Assess the time and space complexity of the code.
                Code Quality: Review the code for readability, maintainability, and adherence to coding standards.

                Feedback: Provide detailed feedback, highlighting strengths and areas for improvement.

                Instructions for Providing Candidate Feedback:
                Context: Use the conversation history as context and the coding problems that you analyzed and based on that provide a detailed feedback.
                Overall Performance: Assess the candidate’s approach to problem-solving and coding.
                Strengths: Highlight what the candidate did well, such as understanding the problem, coding efficiently, or using best practices.
                Areas for Improvement: Identify specific areas where the candidate can improve, such as optimizing code, handling edge cases, or improving code readability.
                Suggestions: Offer actionable advice to help the candidate enhance their skills
    `),
      ],
    })

    return result2
  }
}
