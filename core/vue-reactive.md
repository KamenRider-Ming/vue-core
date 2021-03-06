# 镇题之宝
先留下镇题之宝，这张图很清晰的介绍了vue响应式原理的基本流程

![镇题之宝](img/vue-reactive.png)

# 概念
接触到源码证明读者已经对JS这个语言有了比较深度的了解，这里不会过多介绍跟JS语言学习相关的内容。

vue响应式原理中有几个比较基础的概念：

1. 观察者模式：设计模式之一
2. 代理模式：设计模式之一
3. Observer 被观察者：所有的值都会被生成一个对应的Observer对象，用于做消息发布操作
4. Watcher 观察者/订阅事件者：所有做监控的地方都会创建Watcher对象，用于接受消息发布的通知
5. Dep 依赖收集器：帮助Observer和Watcher建立连接，一个Observer被改变了要通知哪些Watcher由它来建立这种联系

# 实现

## 工具函数
只是一些方便代码编写的函数而已
```js
// 用于便捷的复写某个对象的属性或者方法
function def(obj, key, val, enumerable = true) {
  Object.defineProperty(obj, key, {
    value: val,
    configurable: true,
    enumerable: enumerable,
    writable: true
  })
}

// 用于判断一个值的类型，所有类型都可以判断
// type(NaN) 获得到一个Number类型
function type(obj) {
  return Object.prototype.toString.call(obj).slice(8).split(']')[0]
}

function remove(arr, v) {
  for (let i in arr) {
    if (arr[i] === v) {
      arr.splice(i, 1)
      break
    }
  }
}
```

## Watcher观察者
当需要监控某个值的变化时，需要使用到该类，构造函数支持一个回调函数，用于监控的值发生变化时，可以调用这个回调函数
```js
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
```

## Dep依赖收集器
```js
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

  // 用于调试时打印观察该依赖器中有多少watcher
  watchers() {
    console.log('watchers size: ', this.watchers.length)
    for (let idx in this.watchers) {
      const watcher = this.watchers[idx]
      console.log('id: ', watcher.id, ', name: ', watcher.name)
    }
  }
}

Dep.curWatcher = null
```
这个地方可能会让人有点误解，curWatcher的用处是干什么的，由于JS是单线程语言，所以使用`Dep.curWatcher`一个全局变量，就可以将当前watcher传递到任何地方。

## Observer：需要被观察的对象

```js
// 重写Array函数，确保调用时可以触发watcher的回调函数
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

    // 该点是针对数组对象使用的
    // 比如：a: {b: [] }
    // 我们改变b的值，除了调用b.setter拦截器外，还可以调用Array的函数，比如：push, pop等
    // 这些应该都可以触发相关watcher的回调
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
```

## 测试
```js
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


// ------console结果---------
watcher1 , new:  12345 , old:  123
---------------------
watcher2 , new:  { test1: [Getter/Setter] } , old:  {
  value1: [Getter/Setter],
  value2: [Getter/Setter],
  values: [Getter/Setter]
}
---------------------
watcher1 , new:  [ 5 ] , old:  []
watcher1 , new:  [ 1, 2, 3 ] , old:  []
---------------------
finished
```

# 总结

当然vue的这部分响应式原理的代码会更加复杂一些，因为我们这个是脱离Dom的，很多情况都没有考虑到，不过大致原理是一致的，通过完善上面的部分代码也可以实现如vue相关的功能，比如watch中的deep属性，我们可以在childObserver那里做文章，就可以控制是深监控还是浅监控。