import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Conversation extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare roomID: number

  @column()
  declare message: string

  @column()
  declare sender: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
