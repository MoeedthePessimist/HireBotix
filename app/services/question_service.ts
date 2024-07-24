import { llm, embeddings } from '#config/langchain'
import { pcIndex } from '#config/pinecone'
import Conversation from '#models/conversation'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { PineconeStore, PineconeTranslator } from '@langchain/pinecone'
import {
  AgentExecutor,
  createOpenAIFunctionsAgent,
  createReactAgent,
  createToolCallingAgent,
} from 'langchain/agents'
import { AttributeInfo } from 'langchain/chains/query_constructor'
import { Document } from 'langchain/document'
import { pull } from 'langchain/hub'
import { SelfQueryRetriever } from 'langchain/retrievers/self_query'
import { createRetrieverTool } from 'langchain/tools/retriever'
import fs from 'node:fs'

export default class QuestionService {
  randNum() {
    return Math.floor(Math.random() * 1000)
  }

  getHumanPrompt(queryType: string) {
    const generateQuestionPrompt = `Based on the difficulty level {difficulty} and category {category}, generate a new coding question using the existing questions in the vector database. The question should be clear and detailed, including the problem statement, input/output description, and constraints.`
    const analyzeQuestionPrompt = `Analyze the following code submission for the question in the previous prompt. Provide detailed feedback on its correctness, efficiency, and code quality. Suggest improvements where necessary.
                                   Code:
                                   {code}
                                  `
    const candidateFeedbackPrompt = `Provide feedback on the candidate's overall performance for their overall performance and the questions that they solved. Highlight their strengths, areas for improvement, and give specific suggestions to help them improve their skills.`
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
      console.log(room, 'room')
      const conversation = await Conversation.query().where('room', room)
      console.log(conversation[1].message)
      chatHistory = conversation.map((value, index) => {
        const object =
          value.sender.toLowerCase() === 'ai'
            ? new AIMessage(value.message)
            : new HumanMessage(value.message)

        return object
      })

      console.log(chatHistory)
    }

    const systemMessage = `
      You are a highly knowledgeable and experienced technical interviewer specializing in evaluating coding skills and problem-solving abilities. Your task is to generate new coding questions based on specified difficulty levels and categories, provide detailed analysis and feedback on code submissions for these questions, and give overall feedback to the candidate on their performance.

      Responsibilities:
      Generate Coding Questions:

      Create new coding questions based on the provided difficulty level and category.
      Ensure the questions are clear, concise, and cover various topics like algorithms, data structures, system design, etc.
      Analyze Code Submissions:

      Evaluate the provided code for correctness, efficiency, and best practices.
      Identify potential improvements and provide constructive feedback.
      Highlight any errors or suboptimal code segments with suggestions for improvement.
      Provide Candidate Feedback:

      Offer comprehensive feedback on the candidate's overall performance.
      Highlight strengths, areas for improvement, and provide specific suggestions to help the candidate improve their skills.
      Instructions for Generating Questions:
      Difficulty Levels: Easy, Medium, Hard
      Categories: Algorithms, Data Structures, System Design, General Programming
      Format: Include a problem statement, input/output description, and constraints.
      Instructions for Analyzing Code:
      Correctness: Verify if the code produces the correct output for given inputs.
      Efficiency: Assess the time and space complexity of the code.
      Code Quality: Review the code for readability, maintainability, and adherence to coding standards.
      Feedback: Provide detailed feedback, highlighting strengths and areas for improvement.
      Instructions for Providing Candidate Feedback:
      Overall Performance: Assess the candidate’s approach to problem-solving and coding.
      Strengths: Highlight what the candidate did well, such as understanding the problem, coding efficiently, or using best practices.
      Areas for Improvement: Identify specific areas where the candidate can improve, such as optimizing code, handling edge cases, or improving code readability.
      Suggestions: Offer actionable advice to help the candidate enhance their skills
    `

    let humanMessage = this.getHumanPrompt(queryType)

    console.log(humanMessage)

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

    const promptMessages = await prompt.formatMessages({
      code: code,
      difficulty: difficulty,
      category: 'Random',
      chat_history: chatHistory,
    })

    const retrieverTool = createRetrieverTool(retriever, {
      name: 'generate_new_problem',
      description:
        'Generate a new problem based on the provided difficulty. You must use this tool for generating a new question',
      verbose: true,
    })

    const tools = [retrieverTool]

    const agent = await createOpenAIFunctionsAgent({
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
            category: 'Random',
          }
        : {
            code: code,
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
    //   llm: llm,
    //   retriever: retreiver,
    //   rephrasePrompt: historyAwarePrompt,
    // })

    // const historyAwareCombineDocsChain = await createStuffDocumentsChain({
    //   llm: llm,
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
