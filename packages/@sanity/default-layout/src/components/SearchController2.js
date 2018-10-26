import {flow, compact, flatten, union} from 'lodash'
import client from 'part:@sanity/base/client?'
import Preview from 'part:@sanity/base/preview?'
import {IntentLink} from 'part:@sanity/base/router'
import schema from 'part:@sanity/base/schema?'
import {getPublishedId, isDraftId, getDraftId} from 'part:@sanity/base/util/draft-utils'
import PropTypes from 'prop-types'
import React from 'react'
import Ink from 'react-ink'
import {Subject} from 'rxjs'
import {filter, takeUntil, tap, debounceTime, map, switchMap} from 'rxjs/operators'
import SearchField from './SearchField'
import SearchResults from './SearchResults'

// Removes published documents that also has a draft
function removeDupes(documents) {
  const drafts = documents.map(doc => doc._id).filter(isDraftId)

  return documents.filter(doc => {
    const draftId = getDraftId(doc._id)
    const publishedId = getPublishedId(doc._id)
    const hasDraft = drafts.includes(draftId)
    const isPublished = doc._id === publishedId
    return isPublished ? !hasDraft : true
  })
}

const combineFields = flow([flatten, union, compact])

function search(query) {
  if (!client) {
    throw new Error('Sanity client is missing')
  }

  const candidateTypes = schema
    .getTypeNames()
    .filter(typeName => !typeName.startsWith('sanity.'))
    .map(typeName => schema.get(typeName))

  const terms = query.split(/\s+/).filter(Boolean)

  const params = terms.reduce((acc, term, i) => {
    acc[`t${i}`] = `${term}*`
    return acc
  }, {})

  const uniqueFields = combineFields(candidateTypes.map(type => type.__unstable_searchFields))
  const constraints = terms.map((term, i) => uniqueFields.map(field => `${field} match $t${i}`))
  const constraintString = constraints
    .map(constraint => `(${constraint.join(' || ')})`)
    .join(' && ')
  return client.observable.fetch(`*[${constraintString}][0...100]`, params)
}

class SearchController2 extends React.PureComponent {
  static propTypes = {
    onOpen: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    isOpen: PropTypes.bool.isRequired
  }

  input$ = new Subject()
  componentWillUnmount$ = new Subject()
  fieldInstance = null
  resultsInstance = null

  state = {
    activeIndex: -1,
    isBleeding: true, // mobile first
    isLoading: false,
    isOpen: false,
    isPressing: false,
    results: [],
    value: ''
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleWindowKeyDown)
    window.addEventListener('mouseup', this.handleWindowMouseUp)
    window.addEventListener('resize', this.handleWindowResize)

    this.input$
      .asObservable()
      .pipe(
        map(event => event.target.value),
        tap(value => this.setState({activeIndex: -1, value})),
        takeUntil(this.componentWillUnmount$.asObservable())
      )
      .subscribe()

    this.input$
      .asObservable()
      .pipe(
        map(event => event.target.value),
        filter(value => value.length === 0),
        tap(() => {
          this.setState({results: []})
        })
      )
      .subscribe()

    this.input$
      .asObservable()
      .pipe(
        map(event => event.target.value),
        filter(value => value.length > 0),
        tap(() => {
          this.setState({
            isLoading: true
          })
        }),
        debounceTime(100),
        switchMap(search),
        // we need this filtering because the search may return documents of types not in schema
        map(hits => hits.filter(hit => schema.has(hit._type))),
        map(removeDupes),
        tap(results => {
          this.setState({
            isLoading: false,
            results
          })
        }),
        takeUntil(this.componentWillUnmount$.asObservable())
      )
      .subscribe()

    // trigger initial resize
    this.handleWindowResize()
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      this.fieldInstance.inputElement.select()
    }
  }

  componentWillUnmount() {
    window.removeEventListener('mouseup', this.handleWindowMouseUp)
    window.removeEventListener('keydown', this.handleWindowKeyDown)
    window.removeEventListener('resize', this.handleWindowResize)

    this.componentWillUnmount$.next()
    this.componentWillUnmount$.complete()
  }

  handleBlur = () => {
    if (!this.state.isPressing) {
      this.props.onClose()
      this.setState({isOpen: false})
    }
  }

  handleChange = event => {
    this.input$.next(event)
  }

  handleClear = () => {
    this.props.onClose()
    this.setState({isOpen: false, value: '', results: []})
  }

  handleFocus = () => {
    this.props.onOpen()
    this.setState({isOpen: true})
  }

  /* eslint-disable-next-line complexity */
  handleKeyDown = event => {
    const {isOpen, results, activeIndex} = this.state
    const isArrowKey = ['ArrowUp', 'ArrowDown'].includes(event.key)
    const lastIndex = results.length - 1

    if (event.key === 'Enter') {
      this.resultsInstance.element.querySelector(`[data-hit-index="${activeIndex}"]`).click()
    }

    if (event.key === 'Escape') {
      // this.handleClear()
      this.fieldInstance.inputElement.blur()
    }

    if (!isOpen && isArrowKey) {
      this.handleOpen()
      return
    }

    if (isArrowKey) {
      event.preventDefault()

      let nextIndex = activeIndex + (event.key === 'ArrowUp' ? -1 : 1)

      if (nextIndex < 0) {
        nextIndex = lastIndex
      }

      if (nextIndex > lastIndex) {
        nextIndex = 0
      }

      this.setState({activeIndex: nextIndex})
    }
  }

  handleMouseDown = () => {
    this.setState({isPressing: true})
  }

  handleWindowKeyDown = () => {
    // TODO
  }

  handleWindowResize = () => {
    const isBleeding = !window.matchMedia('all and (min-width: 32em)').matches

    this.setState({isBleeding})
  }

  handleWindowMouseUp = () => {
    this.setState({isPressing: false})
  }

  handleHitClick = event => {
    this.handleClear()
  }

  handleHitMouseDown = event => {
    this.setState({
      activeIndex: Number(event.currentTarget.getAttribute('data-hit-index'))
    })
  }

  setFieldInstance = ref => {
    this.fieldInstance = ref
  }

  setResultsInstance = ref => {
    this.resultsInstance = ref
  }

  renderItem = (item, index) => {
    const type = schema.get(item._type)
    return (
      <IntentLink
        intent="edit"
        params={{id: item._id, type: type.name}}
        data-hit-index={index}
        onMouseDown={this.handleHitMouseDown}
        onClick={this.handleHitClick}
        tabIndex={-1}
      >
        <Preview value={item} layout="default" type={type} />
        <Ink duration={200} opacity={0.1} radius={200} />
      </IntentLink>
    )
  }

  renderResults() {
    const {activeIndex, isLoading, results, value} = this.state
    const noResults = !isLoading && value.length > 0 && results.length === 0

    if (isLoading) {
      return (
        <div style={{padding: '1em', textAlign: 'center', borderTop: '1px solid #eee'}}>
          Loading results...
        </div>
      )
    }

    if (noResults) {
      return (
        <div style={{padding: '1em', textAlign: 'center', borderTop: '1px solid #eee'}}>
          Could not find{' '}
          <strong>
            &ldquo;
            {value}
            &rdquo;
          </strong>
        </div>
      )
    }

    if (results.length === 0) {
      return null
    }

    return (
      <SearchResults
        activeIndex={activeIndex}
        items={results}
        renderItem={this.renderItem}
        ref={this.setResultsInstance}
      />
    )
  }

  render() {
    const {isBleeding, isLoading, isOpen, value} = this.state
    return (
      <SearchField
        isBleeding={isBleeding}
        isLoading={isLoading}
        isOpen={isOpen}
        onBlur={this.handleBlur}
        onChange={this.handleChange}
        onClear={this.handleClear}
        onFocus={this.handleFocus}
        onKeyDown={this.handleKeyDown}
        onMouseDown={this.handleMouseDown}
        ref={this.setFieldInstance}
        results={this.renderResults()}
        value={value}
      />
    )
  }
}

export default SearchController2
