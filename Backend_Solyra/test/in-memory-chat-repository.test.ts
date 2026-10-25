import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { ChatMessage, Conversation } from '@solyra/shared';
import { InMemoryChatRepository } from '../src/persistence/in-memory/chat.repository.js';

describe('InMemoryChatRepository (IChatRepository Contract Compliance)', () => {
  let repo: InMemoryChatRepository;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
  });

  it('creates and retrieves a conversation by id', async () => {
    const conversation: Conversation = {
      id: 'conv-101',
      workspaceId: 'ws-alpha',
      userId: 'user-001',
      title: 'Alpha Conversation',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T12:00:00Z'),
      updatedAt: new Date('2026-10-24T12:00:00Z'),
    };

    const created = await repo.createConversation(conversation);
    assert.equal(created.id, 'conv-101');
    assert.equal(created.title, 'Alpha Conversation');

    const fetched = await repo.getConversation('conv-101');
    assert.ok(fetched);
    assert.equal(fetched?.workspaceId, 'ws-alpha');
  });

  it('returns null for a missing conversation', async () => {
    assert.equal(await repo.getConversation('missing-id'), null);
  });

  it('lists conversations only for the matching workspace and optional user', async () => {
    const alphaA: Conversation = {
      id: 'c1',
      workspaceId: 'ws-alpha',
      userId: 'user-001',
      title: 'Alpha User 1',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T10:00:00Z'),
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    };
    const alphaB: Conversation = {
      id: 'c2',
      workspaceId: 'ws-alpha',
      userId: 'user-002',
      title: 'Alpha User 2',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T11:00:00Z'),
      updatedAt: new Date('2026-10-24T11:00:00Z'),
    };
    const betaA: Conversation = {
      id: 'c3',
      workspaceId: 'ws-beta',
      userId: 'user-001',
      title: 'Beta User 1',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T12:00:00Z'),
      updatedAt: new Date('2026-10-24T12:00:00Z'),
    };

    await repo.createConversation(alphaA);
    await repo.createConversation(alphaB);
    await repo.createConversation(betaA);

    const workspaceResults = await repo.listConversations('ws-alpha');
    assert.deepEqual(
      workspaceResults.map((conversation) => conversation.id).sort(),
      ['c1', 'c2'],
    );

    const workspaceUserResults = await repo.listConversations('ws-alpha', 'user-001');
    assert.deepEqual(workspaceUserResults.map((conversation) => conversation.id), ['c1']);

    const betaResults = await repo.listConversations('ws-beta');
    assert.deepEqual(betaResults.map((conversation) => conversation.id), ['c3']);
  });

  it('deletes conversation only when workspace matches and cleans up messages', async () => {
    const conversation: Conversation = {
      id: 'conv-del',
      workspaceId: 'ws-alpha',
      userId: 'user-001',
      title: 'Delete Me',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const message: ChatMessage = {
      id: 'msg-1',
      conversationId: 'conv-del',
      senderId: 'user-001',
      role: 'user',
      content: 'Hello delete',
      createdAt: new Date(),
    };

    await repo.createConversation(conversation);
    await repo.appendMessage(message);

    assert.equal(await repo.deleteConversation('conv-del', 'ws-beta'), false);
    assert.ok(await repo.getConversation('conv-del'));

    assert.equal(await repo.deleteConversation('conv-del', 'ws-alpha'), true);
    assert.equal(await repo.getConversation('conv-del'), null);
    assert.deepEqual(await repo.getMessages('conv-del'), []);
  });

  it('appends and retrieves message history in order', async () => {
    const messageA: ChatMessage = {
      id: 'm1',
      conversationId: 'conv-msg-test',
      senderId: 'user-001',
      role: 'user',
      content: 'First turn',
      createdAt: new Date('2026-10-24T10:00:00Z'),
    };
    const messageB: ChatMessage = {
      id: 'm2',
      conversationId: 'conv-msg-test',
      senderId: 'assistant',
      role: 'assistant',
      content: 'Second turn',
      createdAt: new Date('2026-10-24T10:01:00Z'),
    };

    await repo.appendMessage(messageA);
    await repo.appendMessage(messageB);

    const messages = await repo.getMessages('conv-msg-test');
    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, 'm1');
    assert.equal(messages[1].id, 'm2');
  });

  it('keeps different workspaces isolated', async () => {
    const alpha: Conversation = {
      id: 'a1',
      workspaceId: 'ws-alpha',
      userId: 'user-001',
      title: 'Alpha',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T09:00:00Z'),
      updatedAt: new Date('2026-10-24T09:00:00Z'),
    };
    const beta: Conversation = {
      id: 'b1',
      workspaceId: 'ws-beta',
      userId: 'user-001',
      title: 'Beta',
      modelIdentifier: 'solyra-default',
      messageCount: 0,
      createdAt: new Date('2026-10-24T09:05:00Z'),
      updatedAt: new Date('2026-10-24T09:05:00Z'),
    };

    await repo.createConversation(alpha);
    await repo.createConversation(beta);

    assert.deepEqual((await repo.listConversations('ws-alpha')).map((conversation) => conversation.id), ['a1']);
    assert.deepEqual((await repo.listConversations('ws-beta')).map((conversation) => conversation.id), ['b1']);
    assert.equal(await repo.deleteConversation('a1', 'ws-beta'), false);
    assert.ok(await repo.getConversation('a1'));
  });
});
