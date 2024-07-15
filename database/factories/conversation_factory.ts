import factory from '@adonisjs/lucid/factories'
import Conversation from '#models/conversation'

export const ConversationFactory = factory
  .define(Conversation, async ({ faker }) => {
    return {}
  })
  .build()
