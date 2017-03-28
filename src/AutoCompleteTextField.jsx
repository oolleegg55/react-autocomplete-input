import React, { PropTypes } from 'react';
import { findDOMNode } from 'react-dom';
import getCaretCoordinates from 'textarea-caret';
import getInputSelection, { setCaretPosition } from 'get-input-selection';
import './AutoCompleteTextField.css';

const KEY_UP = 38;
const KEY_DOWN = 40;
const KEY_RETURN = 13;
const KEY_ENTER = 14;
const KEY_ESCAPE = 27;

const OPTION_LIST_Y_OFFSET = 10;
const OPTION_LIST_MIN_WIDTH = 100;

const propTypes = {
  Wrapper: PropTypes.string,
  wrapperClass: PropTypes.string,
  Component: PropTypes.string,
  defaultValue: PropTypes.string,
  disabled: PropTypes.bool,
  maxOptions: PropTypes.number,
  onBlur: PropTypes.func,
  onChange: PropTypes.func,
  onKeyDown: PropTypes.func,
  onRequestOptions: PropTypes.func,
  options: PropTypes.array,
  regex: PropTypes.string,
  requestOnlyIfNoOptions: PropTypes.bool,
  spaceRemovers: PropTypes.array,
  trigger: PropTypes.string,
  value: PropTypes.any,
};

const defaultProps = {
  Wrapper: 'span',
  wrapperClass: '',
  Component: 'textarea',
  defaultValue: '',
  disabled: false,
  maxOptions: 6,
  onBlur: () => {},
  onChange: () => {},
  onKeyDown: () => {},
  onRequestOptions: () => {},
  options: [],
  regex: '^[A-Za-z0-9\\-_]+$',
  requestOnlyIfNoOptions: true,
  spaceRemovers: [',', '.', '!', '?'],
  trigger: '@',
};

class AutocompleteTextField extends React.Component {
  constructor(props) {
    super(props);

    this.isTrigger = this.isTrigger.bind(this);
    this.getMatch = this.getMatch.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleSelection = this.handleSelection.bind(this);
    this.updateCaretPosition = this.updateCaretPosition.bind(this);
    this.updateHelper = this.updateHelper.bind(this);
    this.resetHelper = this.resetHelper.bind(this);
    this.renderAutocompleteList = this.renderAutocompleteList.bind(this);

    this.state = {
      helperVisible: false,
      left: 0,
      matchLength: 0,
      matchStart: 0,
      options: [],
      selection: 0,
      top: 0,
      value: null,
    };

    this.recentValue = props.defaultValue;
  }

  componentDidMount() {
    window.addEventListener('resize', this.handleResize);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.options.length !== this.props.options.length) {
      this.updateHelper(this.recentValue, this.state.caret, nextProps.options);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  }

  getMatch(str, caret, providedOptions) {
    const triggerLength = this.props.trigger.length;

    for (let i = caret - 1; i >= 0; --i) {
      const re = new RegExp(this.props.regex);
      const substr = str.substring(i, caret);
      const match = substr.match(re);

      if (!match) {
        if (!triggerLength && substr.length === 1) {
          return null;
        }

        const triggerIdx = i - triggerLength + 1;

        if (triggerIdx < 0) {
          return null;
        }

        if (this.isTrigger(str, triggerIdx)) {
          const matchedSlug = substr.substring(1, substr.length);

          const options = providedOptions.filter(slug => slug.substring(0, matchedSlug.length) === matchedSlug);
          const matchLength = matchedSlug.length;
          const matchStart = i + 1;

          return { matchLength, matchStart, options };
        }

        break;
      }
    }

    return null;
  }

  isTrigger(str, i) {
    const { trigger } = this.props;

    if (!trigger || !trigger.length) {
      return true;
    }

    if (str.substr(i, trigger.length) === trigger) {
      return true;
    }

    return false;
  }

  handleBlur() {
    // we need to add small delay if mouse click was used for option selection
    // to ensure that events would be handled in correct order
    setTimeout(() => this.setState({ helperVisible: false }), 50);

    this.props.onBlur();
  }

  handleChange(e) {
    const { onChange, options, spaceRemovers } = this.props;

    const old = this.recentValue;
    const str = e.target.value;
    const caret = getInputSelection(e.target).end;

    if (!str.length) {
      this.setState({ helperVisible: false });
    }

    this.recentValue = str;

    this.setState({ caret, value: e.target.value });

    if (!str.length || !caret) {
      return onChange(e.target.value);
    }

    // '@wonderjenny ,|' -> '@wonderjenny, |'
    if (spaceRemovers.length && str.length > 2) {
      for (let i = 0; i < Math.max(old.length, str.length); ++i) {
        if (old[i] !== str[i]) {
          if (
            i >= 2 &&
            str[i - 1] === ' ' &&
            spaceRemovers.indexOf(str[i - 2]) === -1 &&
            spaceRemovers.indexOf(str[i]) !== -1 &&
            this.getMatch(str.substring(0, i - 2).toLowerCase(), caret - 3, options)
          ) {
            const newValue = (`${str.slice(0, i - 1)}${str.slice(i, str.length)} `);

            this.updateCaretPosition(i + 1);
            findDOMNode(this.refInput).value = newValue;

            if (!this.props.value) {
              this.setState({ value: newValue });
            }

            return onChange(newValue);
          }

          break;
        }
      }
    }

    this.updateHelper(str, caret, options);

    if (!this.props.value) {
      this.setState({ value: e.target.value });
    }

    return onChange(e.target.value);
  }

  handleKeyDown(event) {
    if (this.state.helperVisible) {
      const { options, selection } = this.state;

      switch (event.keyCode) {
        case KEY_ESCAPE:
          event.preventDefault();
          this.resetHelper();
          break;
        case KEY_UP:
          event.preventDefault();
          this.setState({ selection: ((options.length + selection) - 1) % options.length });
          break;
        case KEY_DOWN:
          event.preventDefault();
          this.setState({ selection: (selection + 1) % options.length });
          break;
        case KEY_ENTER:
        case KEY_RETURN:
          event.preventDefault();
          this.handleSelection(selection);
          break;
        default:
          this.props.onKeyDown(event);
          break;
      }
    } else {
      this.props.onKeyDown(event);
    }
  }

  handleResize() {
    this.setState({ helperVisible: false });
  }

  handleSelection(idx) {
    const { matchStart, matchLength, options } = this.state;
    const { trigger } = this.props;

    const triggerLength = trigger.length;
    const slug = options[idx];
    const value = this.recentValue;
    const part1 = value.substring(0, matchStart - triggerLength);
    const part2 = value.substring(matchStart + matchLength + triggerLength, value.length);

    const event = { target: findDOMNode(this.refInput) };

    event.target.value = `${part1}${trigger}${slug} ${part2}`;
    this.handleChange(event);

    this.resetHelper();

    this.updateCaretPosition(part1.length + slug.length + triggerLength + 1);
  }

  updateCaretPosition(caret) {
    this.setState({ caret }, () => setCaretPosition(findDOMNode(this.refInput), caret));
  }

  updateHelper(str, caret, options) {
    const input = findDOMNode(this.refInput);

    const slug = this.getMatch(str.toLowerCase(), caret, options);

    if (slug) {
      const caretPos = getCaretCoordinates(input, caret);
      const rect = input.getBoundingClientRect();

      const top = caretPos.top + input.offsetTop;
      const left = Math.min(caretPos.left + input.offsetLeft - OPTION_LIST_Y_OFFSET, input.offsetLeft + rect.width - OPTION_LIST_MIN_WIDTH);

      if (slug.options.length > 1 || (slug.options.length === 1 && slug.options[0].length !== slug.matchLength)) {
        this.setState({ helperVisible: true, top, left, ...slug });
      } else {
        if (!this.props.requestOnlyIfNoOptions || !slug.options.length) {
          this.props.onRequestOptions(str.substr(slug.matchStart, slug.matchLength));
        }

        this.resetHelper();
      }
    } else {
      this.resetHelper();
    }
  }

  resetHelper() {
    this.setState({ helperVisible: false, selection: 0 });
  }

  /* eslint-disable jsx-a11y/no-static-element-interactions */

  renderAutocompleteList() {
    if (!this.state.helperVisible) {
      return null;
    }

    const { left, matchLength, options, selection, top } = this.state;

    const optionNumber = this.props.maxOptions === 0 ? options.length : this.props.maxOptions;

    const helperOptions = options.slice(0, optionNumber).map((val, idx) => (
      <li
        className={idx === selection ? 'active' : null}
        key={val}
        onClick={() => { this.handleSelection(idx); }}
        onMouseEnter={() => { this.setState({ selection: idx }); }}
      >
        <b>{val.substr(0, matchLength)}</b>
        {val.substr(matchLength, val.length)}
      </li>
    ));

    return (
      <ul className="react-autocomplete-input" style={{ left, top }}>
        {helperOptions}
      </ul>
    );
  }

  /* eslint-enable jsx-a11y/no-static-element-interactions */

  render() {
    const { Wrapper, wrapperClass, Component, defaultValue, disabled, value, children, ...rest } = this.props;

    const propagated = Object.assign({}, rest);
    Object.keys(this.constructor.propTypes).forEach((k) => { delete propagated[k]; });

    let val = '';

    if (typeof value !== 'undefined' && value !== null) {
      val = value;
    } else if (this.state.value) {
      val = this.state.value;
    } else if (defaultValue) {
      val = defaultValue;
    }

    return (
      <Wrapper className={wrapperClass}>
        <Component
          disabled={disabled}
          onBlur={this.handleBlur}
          onChange={this.handleChange}
          onKeyDown={this.handleKeyDown}
          ref={(c) => { this.refInput = c; }}
          value={val}
          {...propagated}
        />
        {this.renderAutocompleteList()}
        {children}
      </Wrapper>
    );
  }
}

AutocompleteTextField.propTypes = propTypes;
AutocompleteTextField.defaultProps = defaultProps;

export default AutocompleteTextField;
