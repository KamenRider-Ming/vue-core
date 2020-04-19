'use strict'

function remove(arr, v) {
  for (let i in arr) {
    if (arr[i] === v) {
      arr.splice(i, 1)
      break
    }
  }
}

function def(obj, key, val, enumerable = true) {
  Object.defineProperty(obj, key, {
    value: val,
    configurable: true,
    enumerable: enumerable,
    writable: true
  })
}

function type(obj) {
  return Object.prototype.toString.call(obj).slice(8).split(']')[0]
}

function arrayProto(value, dep) {
  let proto = Object.create(Array.prototype)
  const methods = ['push', 'pop', 'shift', 'splice', 'unshift']
  methods.forEach((method) => {  // 使用闭包
    def(proto, method, function(...args) {
      let insertData = []
      switch(method) {
        case 'pop': // 无参数
        case 'push': // 不定参数
          insertData = args
          break
        case 'shift': // 无参数
        case 'unshift': //不定参数
          insertData = args
          break
        case 'splice': // start, count, ...Members
          insertData = args.slice(2)
          break
      }

      const result = Array.prototype[method].call(this, ...args)
      if (insertData) {
        insertData.forEach((data) => {
          buildObserver(data)
        })
      }

      dep.update(insertData, [])
      return result
    })
  })

  value.__proto__ = proto
}

let uid = 0

class Watcher {
  constructor(name, cb) {
    this.name = name
    this.id = uid ++
    this.cb = cb
  }

  run(newValue, oldValue) {
    this.cb.call(null, newValue, oldValue)
  }
}

class Dep {
  constructor() {
    this.watchers = []
    this.watcherIds = new Set()
  }

  addWatcher() {
    if (Dep.curWatcher !== null) {
      // 避免重复添加同一个watcher
      if (!this.watcherIds.has(Dep.curWatcher.id)) {
        this.watchers.push(Dep.curWatcher)
        this.watcherIds.add(Dep.curWatcher.id)
      }
    }
  }

  removeWatcher(watcher) {
    remove(this.watchers, watcher)
  }

  update(newValue, oldValue) {
    for (let idx in this.watchers) {
      const watcher = this.watchers[idx]
      watcher.run(newValue, oldValue)
    }
  }

  watchers() {
    console.log('watchers size: ', this.watchers.length)
    for (let idx in this.watchers) {
      const watcher = this.watchers[idx]
      console.log('id: ', watcher.id, ', name: ', watcher.name)
    }
  }
}

Dep.curWatcher = null

function buildObserver(value) {
  // 只有对象才监控
  if (typeof value === 'object') {
    // console.log(value)
    // 防止重复构建Observer对象
    if (value.hasOwnProperty('__ob__') && value.__ob__ &&
          value.__ob__ instanceof Observer) {
      return
    }

    return new Observer(value)
  }
}

class Observer {
  constructor(value) {
    this.value = value
    // 该成员的存在只是为了处理像Array这个特殊情况
    this.dep = new Dep()

    // 做标记防止重复构建
    // 必须使用enumerable: false来阻止后续被遍历出来造成死循环
    def(value, '__ob__', this, false)
    
    // 当前对象是数组时需要覆盖重写会触发数据变更的函数
    if (type(value) === 'Array') {
      arrayProto(this.value, this.dep)
    }
    this.walk()
  }

  walk() {
    if (typeof this.value === 'object') {
      for (const key in this.value) {
        this.defineReactive(this.value, key)
      }
    }
  }
  defineReactive(obj, key) {
    // 每个key的依赖一般都不一样，所以需要用一个新的Dep
    // 这里使用了JS 闭包的原理
    let dep = new Dep()
    let value = obj[key]
    let childObserver = buildObserver(obj[key])
    Object.defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      get: function() {
        dep.addWatcher()
        if (childObserver) {
          childObserver.dep.addWatcher()
        }
        // dep.watchers()
        return value
      },
      set: function(newValue) {
        // console.log('set')
        const oldValue = value
        value = newValue
        // 重新设置的值可能存在对象所以要尝试处理一下
        buildObserver(value)
        // 通知watcher
        dep.update(value, oldValue)
      }
    })
  }
}

// 一个组件中的data数据
const data = {
  observer1: 123,
  observer2: {
    observer2Sub1: {
      observer2Sub1Sub1: {
        value1: 1,
        value2: 'value2',
        values: [1, 2, 3]
      },
      observer2Sub1Sub2: 2,
      observer2Sub1Sub3: 'observer2Sub1Sub3',
      observer2Sub1Sub4: [1, 2, 3]
    },
    observer2Sub2: 1,
    observer2Sub3: 'observer2Sub3',
    observer2Sub4: [1, 2, 3]
  },
  observer3: 'observer3',
  observer4: [{
    observer4Arr1: 1,
    observer4Arr2: 'observer4Arr2',
    observer4Arr3: {
      observer4Arr3Value1: 1,
      observer4Arr3Value2: 'observer4Arr3Value2'
    }
  }, 2, 3]
}

buildObserver(data)

const watcher1 = new Watcher('watcher1', function(newValue, oldValue) {
  console.log('watcher1', ', new: ', newValue, ', old: ', oldValue)
})

const watcher2 = new Watcher('watcher2', function(newValue, oldValue) {
  console.log('watcher2', ', new: ', newValue, ', old: ', oldValue)
})

Dep.curWatcher = watcher1
// 调用一次get将watcher1注入
data.observer1
Dep.curWatcher = null
data.observer2.observer2Sub1.observer2Sub1Sub1.value1 = 4
data.observer1 = '12345'
console.log('---------------------')

Dep.curWatcher = watcher2
data.observer2.observer2Sub1.observer2Sub1Sub1
Dep.curWatcher = null
data.observer2.observer2Sub1.observer2Sub1Sub1 = { test1: 'test1' }
console.log('---------------------')

Dep.curWatcher = watcher1
data.observer4
Dep.curWatcher = null
data.observer4.push(5)
data.observer4.unshift(1, 2, 3)
console.log('---------------------')
console.log('finished')