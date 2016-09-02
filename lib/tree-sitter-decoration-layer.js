/** @babel */

import {Document} from 'tree-sitter'
import * as point from './point-helpers'

export default class TreeSitterDecorationLayer {
  constructor ({buffer, language, scopeMap}) {
    this.buffer = buffer
    this.scopeMap = scopeMap
    this.document = new Document()
      .setInput(new InputAdaptor(buffer))
      .setLanguage(language)
      .parse()
  }

  buildIterator () {
    return new TreeSitterDecorationIterator(this)
  }
}

class TreeSitterDecorationIterator {
  constructor (layer, document) {
    this.layer = layer
    this.closeTags = null
    this.openTags = null
    this.containingNodeTypes = null
    this.currentNode = null
  }

  seek (targetPosition) {
    this.closeTags = []
    this.openTags = []
    this.containingNodeTypes = []
    this.currentPosition = targetPosition
    this.currentIndex = this.layer.buffer.characterIndexForPosition(targetPosition)

    let currentNode = this.layer.document.rootNode
    while (currentNode) {
      this.currentNode = currentNode
      this.containingNodeTypes.push(currentNode.type)

      if (this.currentIndex === currentNode.startIndex) {
        const scopeName = this.currentScopeName()
        if (scopeName) this.openTags.push(scopeName)
      }

      const {children} = currentNode
      currentNode = null
      for (let i = 0, childCount = children.length; i < childCount; i++) {
        const child = children[i]
        if (child.endIndex > this.currentIndex) {
          currentNode = child
          break
        }
      }
    }
  }

  moveToSuccessor () {
    if (!this.currentNode) return false

    this.closeTags = []
    this.openTags = []

    do {
      if (this.currentIndex < this.currentNode.endIndex) {
        while (true) {
          this.pushCloseTag()
          const nextSibling = this.currentNode.nextSibling
          if (nextSibling) {
            if (this.currentNode.endIndex === nextSibling.startIndex) {
              this.currentNode = nextSibling
              this.currentIndex = nextSibling.startIndex
              this.currentPosition = nextSibling.startPosition
              this.pushOpenTag()
              this.descendLeft()
            } else {
              this.currentIndex = this.currentNode.endIndex
              this.currentPosition = this.currentNode.endPosition
            }
            break
          } else {
            this.currentIndex = this.currentNode.endIndex
            this.currentPosition = this.currentNode.endPosition
            this.currentNode = this.currentNode.parent
            if (!this.currentNode) break
          }
        }
      } else {
        this.currentNode = this.currentNode.nextSibling
        this.currentPosition = this.currentNode.startPosition
        this.currentIndex = this.currentNode.startIndex
        this.pushOpenTag()
        this.descendLeft()
      }
    } while (this.closeTags.length === 0 && this.openTags.length === 0 && this.currentNode)

    return true
  }

  getPosition () {
    return this.currentPosition
  }

  getCloseTags () {
    return this.closeTags
  }

  getOpenTags () {
    return this.openTags
  }

  // Private methods

  descendLeft () {
    let child
    while ((child = this.currentNode.children[0])) {
      this.currentNode = child
      this.pushOpenTag()
    }
  }

  currentScopeName () {
    return this.layer.scopeMap.scopeNameForScopeDescriptor(this.containingNodeTypes, this.currentNode.isNamed)
  }

  pushCloseTag () {
    const scopeName = this.currentScopeName()
    if (scopeName) this.closeTags.push(scopeName)
    this.containingNodeTypes.pop()
  }

  pushOpenTag () {
    this.containingNodeTypes.push(this.currentNode.type)
    const scopeName = this.currentScopeName()
    if (scopeName) this.openTags.push(scopeName)
  }
}

class InputAdaptor {
  constructor (buffer) {
    this.buffer = buffer
    this.seek(0)
  }

  seek (characterIndex) {
    this.position = this.buffer.positionForCharacterIndex(characterIndex)
  }

  read () {
    const endPosition = this.buffer.clipPosition(this.position.traverse({row: 1000, column: 0}))
    const text = this.buffer.getTextInRange([this.position, endPosition])
    this.position = endPosition
    return text
  }
}