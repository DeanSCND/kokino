import db from './schema.js';
import { nanoid } from 'nanoid';

/**
 * Repository for managing headless agent conversations and turns
 */
export class ConversationStore {
  constructor() {
    // Conversation prepared statements
    this.insertConversationStmt = db.prepare(`
      INSERT INTO conversations (conversation_id, agent_id, title, metadata, created_at, updated_at)
      VALUES (@conversationId, @agentId, @title, @metadata, @createdAt, @updatedAt)
    `);

    this.getConversationStmt = db.prepare('SELECT * FROM conversations WHERE conversation_id = ?');
    this.getByAgentStmt = db.prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC');
    this.updateConversationStmt = db.prepare('UPDATE conversations SET title = ?, metadata = ?, updated_at = ? WHERE conversation_id = ?');
    this.deleteConversationStmt = db.prepare('DELETE FROM conversations WHERE conversation_id = ?');

    // Turn prepared statements
    this.insertTurnStmt = db.prepare(`
      INSERT INTO turns (conversation_id, role, content, metadata, created_at)
      VALUES (@conversationId, @role, @content, @metadata, @createdAt)
    `);

    this.getTurnsStmt = db.prepare('SELECT * FROM turns WHERE conversation_id = ? ORDER BY turn_id ASC');
    this.deleteTurnsStmt = db.prepare('DELETE FROM turns WHERE conversation_id = ?');
  }

  // Conversation methods

  /**
   * Create a new conversation
   */
  createConversation(agentId, { title = null, metadata = {} } = {}) {
    const now = new Date().toISOString();
    const conversationId = nanoid();

    this.insertConversationStmt.run({
      conversationId,
      agentId,
      title,
      metadata: JSON.stringify(metadata),
      createdAt: now,
      updatedAt: now
    });

    return conversationId;
  }

  /**
   * Get conversation by ID (without turns)
   */
  getConversation(conversationId) {
    const row = this.getConversationStmt.get(conversationId);
    return row ? this.deserializeConversation(row) : null;
  }

  /**
   * Get conversation with all turns
   */
  getConversationWithTurns(conversationId) {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return null;

    const turns = this.getTurns(conversationId);
    return { ...conversation, turns };
  }

  /**
   * Get all conversations for an agent
   */
  getAgentConversations(agentId) {
    const rows = this.getByAgentStmt.all(agentId);
    return rows.map(r => this.deserializeConversation(r));
  }

  /**
   * Update conversation title/metadata
   */
  updateConversation(conversationId, { title, metadata }) {
    const now = new Date().toISOString();
    const result = this.updateConversationStmt.run(
      title,
      JSON.stringify(metadata),
      now,
      conversationId
    );
    return result.changes > 0;
  }

  /**
   * Delete conversation and all turns
   */
  deleteConversation(conversationId) {
    const result = this.deleteConversationStmt.run(conversationId);
    return result.changes > 0;
  }

  // Turn methods

  /**
   * Add a turn to a conversation
   */
  addTurn(conversationId, { role, content, metadata = {} }) {
    const now = new Date().toISOString();

    this.insertTurnStmt.run({
      conversationId,
      role,
      content,
      metadata: JSON.stringify(metadata),
      createdAt: now
    });

    // Update conversation's updated_at timestamp
    db.prepare('UPDATE conversations SET updated_at = ? WHERE conversation_id = ?')
      .run(now, conversationId);
  }

  /**
   * Get all turns for a conversation
   */
  getTurns(conversationId) {
    const rows = this.getTurnsStmt.all(conversationId);
    return rows.map(r => this.deserializeTurn(r));
  }

  /**
   * Start a new conversation with initial user message
   */
  startConversation(agentId, userMessage, { title = null, metadata = {} } = {}) {
    const conversationId = this.createConversation(agentId, { title, metadata });
    this.addTurn(conversationId, {
      role: 'user',
      content: userMessage,
      metadata: { source: 'ui' }
    });
    return conversationId;
  }

  /**
   * Continue a conversation with user message
   */
  continueConversation(conversationId, userMessage) {
    this.addTurn(conversationId, {
      role: 'user',
      content: userMessage,
      metadata: { source: 'ui' }
    });
  }

  /**
   * Add assistant response to conversation
   */
  addResponse(conversationId, content, metadata = {}) {
    this.addTurn(conversationId, {
      role: 'assistant',
      content,
      metadata
    });
  }

  /**
   * Add system message to conversation
   */
  addSystemMessage(conversationId, content, metadata = {}) {
    this.addTurn(conversationId, {
      role: 'system',
      content,
      metadata
    });
  }

  // Serialization

  deserializeConversation(row) {
    return {
      conversationId: row.conversation_id,
      agentId: row.agent_id,
      title: row.title,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  deserializeTurn(row) {
    return {
      turnId: row.turn_id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at
    };
  }
}
