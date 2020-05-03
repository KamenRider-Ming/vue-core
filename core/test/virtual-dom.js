/*
*
* 这里提取了diff.js部分对列表处理的核心代码
* 
*/

function diffChildren(a, b, patch, apply, index) {
    var aChildren = a.children
    // 用于处理列表中有设置key的优化操作，可以将只是做了位置变更的元素做移动操作而不做创建删除操作
    var orderedSet = reorder(aChildren, b.children)
    var bChildren = orderedSet.children

    var aLen = aChildren.length
    var bLen = bChildren.length
    var len = aLen > bLen ? aLen : bLen

    for (var i = 0; i < len; i++) {
        var leftNode = aChildren[i]
        var rightNode = bChildren[i]
        index += 1

        if (!leftNode) {
            if (rightNode) {
                // Excess nodes in b need to be added
                apply = appendPatch(apply,
                    new VPatch(VPatch.INSERT, null, rightNode))
            }
        } else {
            walk(leftNode, rightNode, patch, index)
        }

        if (isVNode(leftNode) && leftNode.count) {
            index += leftNode.count
        }
    }

    if (orderedSet.moves) {
        // Reorder nodes last
        apply = appendPatch(apply, new VPatch(
            VPatch.ORDER,
            a,
            orderedSet.moves
        ))
    }

    return apply
}

function clearState(vNode, patch, index) {
    // TODO: Make this a single walk, not two
    unhook(vNode, patch, index)
    destroyWidgets(vNode, patch, index)
}

// Patch records for all destroyed widgets must be added because we need
// a DOM node reference for the destroy function
function destroyWidgets(vNode, patch, index) {
    if (isWidget(vNode)) {
        if (typeof vNode.destroy === "function") {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(VPatch.REMOVE, vNode, null)
            )
        }
    } else if (isVNode(vNode) && (vNode.hasWidgets || vNode.hasThunks)) {
        var children = vNode.children
        var len = children.length
        for (var i = 0; i < len; i++) {
            var child = children[i]
            index += 1

            destroyWidgets(child, patch, index)

            if (isVNode(child) && child.count) {
                index += child.count
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

// Create a sub-patch for thunks
function thunks(a, b, patch, index) {
    var nodes = handleThunk(a, b)
    var thunkPatch = diff(nodes.a, nodes.b)
    if (hasPatches(thunkPatch)) {
        patch[index] = new VPatch(VPatch.THUNK, null, thunkPatch)
    }
}

function hasPatches(patch) {
    for (var index in patch) {
        if (index !== "a") {
            return true
        }
    }

    return false
}

function unhook(vNode, patch, index) {
    if (isVNode(vNode)) {
        if (vNode.hooks) {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(
                    VPatch.PROPS,
                    vNode,
                    undefinedKeys(vNode.hooks)
                )
            )
        }

        if (vNode.descendantHooks || vNode.hasThunks) {
            var children = vNode.children
            var len = children.length
            for (var i = 0; i < len; i++) {
                var child = children[i]
                index += 1

                unhook(child, patch, index)

                if (isVNode(child) && child.count) {
                    index += child.count
                }
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

function undefinedKeys(obj) {
    var result = {}

    for (var key in obj) {
        result[key] = undefined
    }

    return result
}

// 比较列表，并且重新排列（这个重新排列逻辑是个诡异的东西）
// aChildren为旧的VNode数据，bChildren为新的VNode的数据
function reorder(aChildren, bChildren) {
    // 构建新VNode相关key的映射map
    var bChildIndex = keyIndex(bChildren)
    var bKeys = bChildIndex.keys // 有带key的数据
    var bFree = bChildIndex.free // 没有带key的数据

    // 当新的VNode一个带key的数据则表明新旧列表没有什么好比较是否有相同key的节点
    // 所以直接返回，将列表交给上层应用，让它按照DFS的模式一个个比较是否需要变更：virutal-dom使用的是一个walk函数
    if (bFree.length === bChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    var aChildIndex = keyIndex(aChildren)
    var aKeys = aChildIndex.keys
    var aFree = aChildIndex.free

    // 道理和上面的一样
    if (aFree.length === aChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    var newChildren = []

    var freeIndex = 0
    var freeCount = bFree.length
    var deletedItems = 0


    // 该操作是为了节省后续比较逻辑的开销，主要是处理以下两种情况
    // 1. 当aChildren中的key在bChilren不存在时，标记为null，在后续处理的时候可以直接标记为删除，不需要多余的处理
    // 2. 当bChilren所有元素用完时，如果aChildren还有剩余也标记为null，后续处理中直接标记为删除，不需要多余的处理
    // 简单来说，下面的这个逻辑只是为了在后续比较做能够做到，拥有key的都是旧元素在bChildren这个新列表中还存在的项
    for (var i = 0 ; i < aChildren.length; i++) {
        var aItem = aChildren[i]
        var itemIndex

        if (aItem.key) {
            if (bKeys.hasOwnProperty(aItem.key)) {
                itemIndex = bKeys[aItem.key]
                newChildren.push(bChildren[itemIndex])

            } else {
                itemIndex = i - deletedItems++  // itemIndex在这里无意义，deletedItems是为了做标记
                newChildren.push(null)
            }
        } else {
            if (freeIndex < freeCount) {
                itemIndex = bFree[freeIndex++]
                newChildren.push(bChildren[itemIndex])
            } else {
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        }
    }

    var lastFreeIndex = freeIndex >= bFree.length ?
        bChildren.length :
        bFree[freeIndex]

    for (var j = 0; j < bChildren.length; j++) {
        var newItem = bChildren[j]

        if (newItem.key) {
            if (!aKeys.hasOwnProperty(newItem.key)) {
                newChildren.push(newItem)
            }
        } else if (j >= lastFreeIndex) {
            newChildren.push(newItem)
        }
    }

    var simulate = newChildren.slice()
    var simulateIndex = 0
    var removes = []
    var inserts = []
    var simulateItem

    for (var k = 0; k < bChildren.length;) {
        var wantedItem = bChildren[k]
        simulateItem = simulate[simulateIndex]

        // 181行注释有解释该逻辑的用处
        while (simulateItem === null && simulate.length) {
            removes.push(remove(simulate, simulateIndex, null))
            simulateItem = simulate[simulateIndex]
        }

        if (!simulateItem || simulateItem.key !== wantedItem.key) {
            // 这里的主要逻辑是，当旧列表和新列表遍历到某个拥有key的数据时，表示这个项应该需要用来做位置交换
            // 会遇到如下几种情况（需要从旧列表往新列表靠拢的角度看）：
            // 1. 新列表当前位置有key，旧列表没有，需要在当前位置插入新列表此时的元素
            // 2. 新列表当前位置有key， 同时旧列表当前位置也有key，如果两者key一致，则不需要做任何处理，如果不一致，则又要按照如下两种情况，通过比较相邻两个元素来处理：
            //    2.1. 如果此时旧列表有key的位置正好是新列表的当前位置的下一个，那么直接插入新列表当前项，在下个循环中，旧列表和新列表对应的项就会直接相等
            //    2.2. 如果此时旧列表有key的下一个位置与新列表当前位置一致，则删掉当前旧列表元素，否则
            //      如果不相等，则只能通过插入新列表当前元素才能确保旧列表向新列表靠拢
            // 3. 新列表当前位置没有key，而旧列表当前位置有key，则直接删除旧列表当前位置的元素
            // 以上第二点并非最优的方法，某种意义上来说，该recorder中只处理了相邻的key交换了位置的情况，
            // 也就是[1, 2]与[2, 1]的情况。不过即便是这样子在处理上也优化至少一个removeChild操作或者insertBefore操作
            if (wantedItem.key) {
                if (simulateItem && simulateItem.key) {
                    if (bKeys[simulateItem.key] !== k + 1) {
                        removes.push(remove(simulate, simulateIndex, simulateItem.key))
                        simulateItem = simulate[simulateIndex]
                        if (!simulateItem || simulateItem.key !== wantedItem.key) {                 
                            inserts.push({key: wantedItem.key, to: k})
                        }
                        else {
                            simulateIndex++
                        }
                    }
                    else {
                        inserts.push({key: wantedItem.key, to: k})
                    }
                }
                else {
                    inserts.push({key: wantedItem.key, to: k})
                }
                k++
            }
            else if (simulateItem && simulateItem.key) {
                removes.push(remove(simulate, simulateIndex, simulateItem.key))
            }
        }
        else {
            simulateIndex++
            k++
        }
    }

    // 当aChildren依旧有值时，表示旧列表的长度比新列表要长，所以接下来遗留的数据直接做remove处理
    while(simulateIndex < simulate.length) {
        simulateItem = simulate[simulateIndex]
        removes.push(remove(simulate, simulateIndex, simulateItem && simulateItem.key))
    }

    // 如果removes等于之前deletedItems的数量，则表示除了删除操作外，没有做其他多余的操作，包括移动替换，添加
    // 所以直接返回新列表即可
    if (removes.length === deletedItems && !inserts.length) {
        return {
            children: newChildren,
            moves: null
        }
    }

    return {
        children: newChildren,
        moves: {
            removes: removes,
            inserts: inserts
        }
    }
}

function remove(arr, index, key) {
    arr.splice(index, 1)

    return {
        from: index,
        key: key
    }
}

function keyIndex(children) {
    var keys = {}
    var free = []
    var length = children.length

    for (var i = 0; i < length; i++) {
        var child = children[i]

        if (child.key) {
            keys[child.key] = i
        } else {
            free.push(i)
        }
    }

    return {
        keys: keys,
        free: free
    }
}

