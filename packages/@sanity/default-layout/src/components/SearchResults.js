import PropTypes from 'prop-types'
import React from 'react'

import styles from './styles/SearchResults.css'

class SearchResults extends React.PureComponent {
  static propTypes = {
    activeIndex: PropTypes.number.isRequired,
    items: PropTypes.arrayOf(
      PropTypes.shape({
        _id: PropTypes.string.isRequired
      })
    ).isRequired,
    renderItem: PropTypes.func.isRequired
  }

  element = null

  setElement = ref => {
    this.element = ref
  }

  render() {
    const {activeIndex, items, renderItem} = this.props

    return (
      <ul className={styles.root} ref={this.setElement}>
        {items.map((item, index) => {
          let className = styles.item
          if (activeIndex === index) className += ` ${styles.activeItem}`
          return (
            <li key={item._id} className={className}>
              {renderItem(item, index)}
            </li>
          )
        })}
      </ul>
    )
  }
}

export default SearchResults
