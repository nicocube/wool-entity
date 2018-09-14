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

const { Id,  Multi } = require('wool-validate')

class WithProxy {
  constructor(mine) {
    this.mine = mine instanceof Array ? mine.reduce((p, c) => { p[c] = true; return p }, {}) : (typeof mine === 'object' ? mine : {})
  }
  withProxy() {
    let mine = this.mine
    return new Proxy(this, {
      has (target, key) {
        return target.has(key)
      },
      get(target, key) {
        if (mine[key]) return target[key].bind(target)
        return target.get(key)
      }
    })
  }
}

class Entity extends WithProxy {
  constructor(name, id, fields) {
    super(['getEntityName', 'getEntityId', 'getEntityFields', 'existing', 'asNew'])
    this.name = name
    this.id = id
    this.fields = fields
  }
  getEntityName(){ return this.name }
  getEntityId(){ return this.id }
  getEntityFields(){ return this.fields }
  existing(f = ()=>true) {
    let l = []
    this.fields.forEach((v, k) => { if (f(k,v)) l.push(v) })
    return Multi(l)
  }
  asNew(f = ()=>true) {
    let l = []
    this.fields.forEach((v, k) => {
      if (f(k,v)) {
        if (k === this.id) v = v.asNew()
        l.push(v)
      }
    })
    return Multi(l)
  }
  has(key) {
    return this.fields.has(key)
  }
  get(key) {
    return this.fields.get(key)
  }
}

class Registry extends WithProxy {
  constructor() {
    super(['add'])
    this.entities = new Map()
  }
  add(name, fieldDefs, opt) {
    let fields = new Map()
    fieldDefs.forEach(c => fields.set(c.k, c))
    let id = opt && ('altid' in opt) ? opt.altid : name.toLowerCase()+'Id'
    if (! fields.has(id)) {
      fields.set(id, Id(id, { prefix: name+': ' }))
    }
    let entity = new Entity(name, id, fields).withProxy()
    this.entities.set(name, entity)
    return entity
  }
  has(key) {
    return this.entities.has(key)
  }
  get(key) {
    return this.entities.get(key)
  }
}

module.exports = {
  Entity, Registry,
  Entities : new Registry().withProxy()
}