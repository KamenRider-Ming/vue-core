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

# 从零开始的响应式思维

如果让我们自己去实现一个响应式，会如何去想，从使用vue的角度上去看的，响应式基本需要具备如下几个功能：
1. 改变某个变量时可以触发DOM节点渲染
2. `computed`属性
3. `watch`显性监控

实现第一点，改变某个变量可以触发DOM节点渲染，也就是说设置某个变量的内容的时候我们需要产生一系列多种。

当前比较好处理的就是使用`Object.defineProperty`和`Proxy`两个JS提供的操作，其中`definePorperty`可以设置`set`设置器可以在设置一个变量的时候触发一个操作，同样的`Proxy`也是一样的，本文采用`ES6`语法，所以使用`Proxy`来实现第一点

```js
'use struct'

let data = {
  test: 'vue',
}

let DOM = '<div>{{test}}</div>'
let showDOM = DOM.replace('{{test}}', data.test)

const handler = {
  set: function(target, propKey, value) {
    console.log('set value:', propKey, value)
    showDOM = DOM.replace('{{' + propKey + '}}', value)
    return Reflect.set(target, propKey, value)
  }
}

console.log(showDOM)
data = new Proxy(data, handler)
data.test = 'vue_v2'
console.log(showDOM)
data.test = 'vue_v3'
console.log(showDOM)
```
