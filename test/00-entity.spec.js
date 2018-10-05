/*
 * Copyright 2018 Nicolas Lochet Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

'use strict'

const test = require('tape-async')
  , { Registry, Model } = require(__dirname + '/../index.js')
  , { Id, Str, List, Dict, Tuple, InvalidRuleError } = require('wool-validate')
  , { Store } = require('wool-store')
  , email = require('email-address')
  , crypto = require('crypto')

// TODO ValidID, Crypto asymetric

test('Entity User, default id, no sub struct', async function(t) {
  let Entities = new Registry().withProxy()
    , store = new Store()
    , p = null

  Entities.add('User', [
    Str('email').predicate(email.isValid),
    Str('login').regex(/^\w{2,}$/),
    Str('password').regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/)
    .crypto(x => Buffer.from(x).toString('base64')) // base 64 is not a good hash for secure password, but this is a test
  ])
  let { User } = Entities

  await store.set('User: 42', {userId: '42', foo: 'bar'})
  t.ok(await User.id.validate(store, { userId: '42' }))
  t.ok(await User.userId.validate(store, { userId: '42' }))
  t.ok(await User.id.asNew().validate(store, { }))
  t.ok(await User.userId.asNew().validate(store, { }))
  t.ok(await User.email.validate(store, { email: 'foo@bar.com' }))
  t.ok(await User.password.validate(store, p = { password: 'xD5Ae8f4ysFG9luB' }))
  t.deepEqual(p, { password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  t.ok(await Entities.User.existing().validate(store, p = { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB'}))
  t.deepEqual(p, { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  let user42 = await User.byId(store, '42')
  t.deepEqual(user42, {userId: '42', foo: 'bar'})

  t.ok(await Entities.User.asNew().validate(store, p = { login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB' }))
  t.ok('userId' in p)
  t.deepEqual(p, { userId: p.userId, login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  await User.save(store, p)

  let userP = await User.byId(store, p.userId)
  t.deepEqual(userP, { userId: p.userId, login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  //*
  userP.email = 'trololo@plop.org'
  await User.save(store, userP)
  let userQ = await User.byId(store, p.userId)
  t.deepEqual(userQ, { userId: p.userId, login: 'foo', email: 'trololo@plop.org', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})
  //*/

  t.plan(15)
  t.end()
})

test('Entity Session, custom id, foreign key, methods', async function(t) {
  let Entities = new Registry().withProxy()
    , User = Entities.add('User', [
      Str('login').regex(/^\w{2,}$/)
    ])
    , Session = Entities.add('Session', [
      Id('sessid', {prefix: 'Session: ', algo: async () => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(24, (err, buf) => {
            if (err) return reject(err)
            resolve(buf.toString('base64'))
          })
        })
      } }),
      Str('login').regex(/^\w{2,}$/),
      User.userId
    ], {
      altid: 'sessid',
      methods: {
        async userFromSession(store, sessid) {
          let { userId } = await this.byId(store, sessid)
          return await User.byId(store, userId)
        }
      }
    })
    , store = new Store()
    , p = null

  t.ok('userFromSession' in Session)

  await store.set('User: 11', {userId: '11', login: 'foo'})
  await store.set('User: 12', {userId: '12', login: 'bar'})
  await store.set('Session: 42', {sessid: '42', foo: 'bar'})
  t.ok(await Session.sessid.validate(store, { sessid: '42' }))

  t.ok(await Session.asNew().validate(store, p = { login: 'foo', userId: '11' }))

  await Session.asNew().validate(store, { login: 'foo', userId: '13' })
  .then(()=> t.fail('should throw') )
  .catch(e => {
    t.ok(e instanceof InvalidRuleError)
    t.deepEqual(e.toString(), 'InvalidRuleError: param.check.should.exists.in.store(ValidId[k:userId], 13)')
  })

  await Session.save(store, p)

  let u = await Session.userFromSession(store, p.sessid)

  t.deepEqual(u, {userId: '11', login: 'foo'})

  t.plan(6)
  t.end()
})

test('Entity Chatroom, list of foreign key, sub Dict', async function(t) {
  class ChatroomModel extends Model {
    constructor(o) {
      super(o)
    }
  }
  let Entities = new Registry().withProxy()
    , User = Entities.add('User', [
      Str('login').regex(/^\w{2,}$/),
    ])
    , Chatroom = Entities.add('Chatroom', [
      Str('name').regex(/^.{0,64}$/),
      Dict('users', Tuple(undefined, [User.id, User.login])),
      List('message',Str())
    ], {
      model: ChatroomModel
    })
    , store = new Store()
    , p = null

  await store.set('User: 11', {userId: '11', login: 'foo'})
  await store.set('User: 12', {userId: '12', login: 'bar'})
  await store.set('Chatroom: 42', { chatroomId: '42', name: 'Foo\'s nest', users: {'11': 'foo'}, message: ['Welcome to Foo\'snest!'] })

  t.ok(await Chatroom.id.validate(store, { chatroomId: '42' }))
  t.ok(await Chatroom.asNew().validate(store, p = { name: 'bar', users: {'11': 'foo', '12': 'bar'}, message: [] }))

  await Chatroom.save(store, p)

  await Chatroom.asNew().validate(store, { name: 'barbar', users: {'11': 'foo', '12': 'bar', '13': 'dude'}, message: ['welcome'] })
  .then(()=> t.fail('should throw') )
  .catch(e => {
    t.ok(e instanceof InvalidRuleError)
    t.deepEqual(e.toString(), 'InvalidRuleError: param.check.should.exists.in.store(ValidId[k:userId], 13)')
  })

  let chatroom = await Chatroom.byId(store, '42')

  t.ok(chatroom instanceof ChatroomModel)

  for (let [, c] of Chatroom.find(store)) {
    //console.log(c)
    t.ok(c instanceof ChatroomModel)
  }

  chatroom = await Chatroom.findOne(store, ([,x]) => x.name === 'bar')
  //console.log(chatroom)
  t.ok(chatroom instanceof ChatroomModel)
  t.deepEqual(chatroom, p)

  t.plan(9)
  t.end()
})
