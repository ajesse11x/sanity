/* eslint-disable complexity */
import React, {Fragment} from 'react'
import {createPortal} from 'react-dom'
import PropTypes from 'prop-types'
import {get} from 'lodash'
import Ink from 'react-ink'
import SearchIcon from 'part:@sanity/base/search-icon'
import CloseIcon from 'part:@sanity/base/close-icon'
import Spinner from 'part:@sanity/components/loading/spinner'
import {isKeyHotkey} from 'is-hotkey'
import Hotkeys from 'part:@sanity/components/typography/hotkeys'
import Poppable from 'part:@sanity/components/utilities/poppable'
import styles from './styles/Search.css'

function isParentOf(possibleParent, possibleChild) {
  let current = possibleChild
  while (current) {
    if (current === possibleParent) {
      return true
    }
    current = current.parentNode
  }
  return false
}

class SearchWidget extends React.PureComponent {
  static propTypes = {
    isOpen: PropTypes.bool,
    isSearching: PropTypes.bool,
    hits: PropTypes.arrayOf(
      PropTypes.shape({
        index: PropTypes.number,
        _id: PropTypes.string
      })
    ),
    inputValue: PropTypes.string,
    renderItem: PropTypes.func.isRequired,
    onOpen: PropTypes.func,
    onClose: PropTypes.func,
    // onClear: PropTypes.func,
    onInputChange: PropTypes.func.isRequired,
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    onKeyDown: PropTypes.func,
    activeIndex: PropTypes.number
  }

  static defaultProps = {
    hits: [],
    isOpen: false,
    isSearching: false,
    inputValue: undefined,
    onOpen: () => {},
    onClose: () => {},
    onFocus: () => {},
    onBlur: () => {},
    onKeyDown: () => {},
    // onClear: () => {},
    activeIndex: undefined
  }

  state = {
    isMobile: false
  }

  componentDidMount() {
    if (window) {
      window.addEventListener('keydown', this.handleWindowKeyDown)
      window.addEventListener('resize', this.handleResize)
    }

    this.handleResize()
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // console.log('select', this.inputElement)
      this.inputElement.focus()
    }
  }

  componentWillUnmount() {
    if (window) {
      window.removeEventListener('keydown', this.handleWindowKeyDown)
    }

    if (this.mobilePortalNode) {
      document.body.removeChild(this.mobilePortalNode)
      this.mobilePortalNode = null
    }
  }

  handleResize = () => {
    // TODO: Better check for mobile
    const isMobile = window && !window.matchMedia('all and (min-width: 32em)').matches

    this.setState({
      isMobile
    })
  }

  handleInputChange = event => {
    this.props.onInputChange(event)
  }

  handleFocus = el => {
    this.props.onFocus()
  }

  handleBlur = event => {
    if (!isParentOf(this.rootElement, event.target)) {
      this.props.onBlur()
    }
  }

  setInput = el => {
    this.inputElement = el
  }

  setListElement = el => {
    this.listElement = el
  }

  setRootElement = el => {
    this.rootElement = el
  }

  handleEscape = () => {
    this.props.onClose()
  }

  handleClickOutside = () => {
    // this.props.onClose()
  }

  handleWindowKeyDown = event => {
    const isOpenSearch = isKeyHotkey('ctrl+t')
    if (isOpenSearch(event)) {
      this.props.onOpen()
      event.preventDefault()
      event.stopPropagation()
    }
  }

  handleKeyDown = event => {
    const {activeIndex} = this.props

    if (event.key === 'Enter') {
      this.listElement.querySelector(`[data-hit-index="${activeIndex}"]`).click()
    }

    this.props.onKeyDown(event)
  }

  renderInput = (isOpen, inputValue) => {
    return (
      <Fragment>
        <label className={styles.label}>
          <SearchIcon />
        </label>
        <input
          className={styles.input}
          type="search"
          value={isOpen ? inputValue : ''}
          onChange={this.handleInputChange}
          onBlur={this.handleBlur}
          onFocus={this.handleFocus}
          onKeyDown={this.handleKeyDown}
          placeholder="Search"
          ref={this.setInput}
        />
        <div className={styles.clearButton} onClick={this.props.onClose} title="Clear search">
          <CloseIcon />
          <Ink duration={1000} opacity={0.1} radius={200} />
        </div>
        <div className={styles.hotkeys}>
          {/* <Hotkeys keys={['Ctrl', 'Alt', 'T']} /> */}
          <Hotkeys keys={['F']} />
        </div>
      </Fragment>
    )
  }

  renderResult = () => {
    const {renderItem, activeIndex, isSearching, hits, isOpen, inputValue} = this.props
    const {isMobile} = this.state
    const isResultShowing = Boolean(isOpen && (inputValue || isSearching || hits > 0))

    if (!isResultShowing) {
      // TODO: add recent documents here
      return <div />
    }

    return (
      <div className={styles.result}>
        {isSearching && (
          <div className={styles.spinner}>
            <Spinner center={isMobile} message={isMobile && 'Searching…'} />
          </div>
        )}
        {inputValue &&
          !isSearching &&
          (!hits || hits.length === 0) && (
            <div className={styles.noHits}>
              Could not find
              <strong>
                &ldquo;
                {inputValue}
                &rdquo;
              </strong>
            </div>
          )}
        {!isSearching &&
          hits &&
          hits.length > 0 && (
            <div className={styles.listContainer}>
              <ul className={styles.hits} ref={this.setListElement}>
                {hits.map((hit, index) => (
                  <li key={hit._id} className={styles.hit}>
                    {renderItem(hit, index, activeIndex)}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    )
  }

  renderMobileResult() {
    const {isOpen, inputValue} = this.props
    if (!this.mobilePortalNode) {
      this.mobilePortalNode = document.createElement('div')
      document.body.appendChild(this.mobilePortalNode)
    }
    return createPortal(
      <div className={styles.mobileSearch} data-visible={isOpen}>
        <div>
          <div className={styles.mobileSearchField}>{this.renderInput(isOpen, inputValue)}</div>
          <div className={styles.mobileSearchResult}>{this.renderResult()}</div>
        </div>
      </div>,
      this.mobilePortalNode
    )
  }

  render() {
    const {isOpen, inputValue} = this.props
    const {isMobile} = this.state
    return (
      <div className={styles.root} ref={this.setRootElement} data-is-result-showing={isOpen}>
        {this.renderMobileResult()}
        <Poppable
          referenceClassName={styles.inner}
          onEscape={this.handleEscape}
          onClickOutside={this.handleClickOutside}
          modifiers={{
            preventOverflow: {
              boundariesElement: 'viewport'
            },
            customStyle: {
              enabled: true,
              fn: data => {
                const width = get(data, 'instance.reference.clientWidth') || 500
                data.styles = {
                  ...data.styles,
                  width,
                  display: isMobile ? 'none' : 'block'
                }

                return data
              }
            }
          }}
          target={this.renderInput(isOpen, inputValue)}
        >
          {this.renderResult()}
        </Poppable>
      </div>
    )
  }
}

export default SearchWidget
