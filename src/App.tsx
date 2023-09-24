import * as React from 'react';
import { createTheme } from '@uiw/codemirror-themes'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view';
import { StreamLanguage, StringStream } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { CalcularLang } from './language';
import { initializeApp } from "firebase/app";
import { EmailAuthProvider, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { addDoc, collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import { auth as uiAuth } from 'firebaseui';

const firebaseConfig = {
  apiKey: "AIzaSyAFjAMwv60FVyKkRfI2nuYZ3f2NNmnPm4w",
  authDomain: "calculr-80971.firebaseapp.com",
  projectId: "calculr-80971",
  storageBucket: "calculr-80971.appspot.com",
  messagingSenderId: "234443508110",
  appId: "1:234443508110:web:d462ac34b1f4c0934bfcdf"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const ui = new uiAuth.AuthUI(auth);

const uiConfig = {
  callbacks: {
    signInSuccessWithAuthResult: function(authResult: any, redirectUrl: any) {
      // User successfully signed in.
      // Return type determines whether we continue the redirect automatically
      // or whether we leave that to developer to handle.
      return true;
    },
    uiShown: function() {
      // The widget is rendered.
      // Hide the loader.
      let loader = document.getElementById('loader')
      if (loader) loader.style.display = 'none';
    }
  },
  // Will use popup for IDP Providers sign-in flow instead of the default, redirect.
  signInFlow: 'popup',
  signInSuccessUrl: '<url-to-redirect-to-on-success>',
  signInOptions: [
    EmailAuthProvider.PROVIDER_ID,
  ],
  // Terms of service url.
  tosUrl: '<your-tos-url>',
  // Privacy policy url.
  privacyPolicyUrl: '<your-privacy-policy-url>'
};

enum InputType {
    DEFAULT,
    PERCENT,
    CURRENCY
}

enum Visibility {
    DEFAULT,
    HIDDEN
}

enum LoginState {
  DEFAULT,
  LOGGED_IN,
  ERROR
}
type MenuProps = { loadProgram: Function, save: Function }
type Calculator = { title: string, program: string }
type MenuState = { calculators: { [id: string]: Calculator }, name: string }
class Menu extends React.Component<MenuProps, MenuState> {
  constructor(props: MenuProps) {
    super(props);
    this.state = { calculators: {}, name: "" };
    this.loadCalculator = this.loadCalculator.bind(this);
    this.save = this.save.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  componentDidMount(): void {
    this.refreshCalculators();
  }

  refreshCalculators() {
    let calculators = collection(db, "calculators");
    getDocs(calculators).then((snapshot) => {
      this.setState({
        calculators: Object.fromEntries(
          snapshot.docs.map((doc) => {
            let { title, program } = doc.data();
            return [doc.id, { title, program }];
          })
        ),
      });
    });
  }

  createUser(email: string, name: string, password: string) {
    const auth = getAuth();
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // Signed in
        const user = userCredential.user;
        return updateProfile(user, { displayName: name });
      })
      .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        // ..
      });
  }

  signIn(email: string, password: string) {
    const auth = getAuth();
    signInWithEmailAndPassword(auth, email, password).then((user) => {});
  }

  loadCalculator(event: any) {
    this.props.loadProgram(this.state.calculators[event.target.value]);
  }

  save() {
    this.props.save(this.state.name);
    this.refreshCalculators();
  }

  handleChange(event: any) {
    let name = event.target.value;
    this.setState({ name });
  }

  render() {
    return (
      <div className="menu">
        <h1>Calculr</h1>
        <select id="calculators" onChange={this.loadCalculator}>
          <option value="">Select calculator to load...</option>
          {Object.entries(this.state.calculators).map(([id, calculator]) => (
            <option key={id} value={id}>
              {calculator.title}
            </option>
          ))}
        </select>
        <div className="spacer"></div>
        <input id="name" placeholder='calculator name...' name="name" onChange={this.handleChange} value={this.state.name}>
        </input>
        <button onClick={this.save}>save</button>
      </div>
    );
  }
}

type ValueBlockProps = { title: string, value: number, type: InputType, visibility: Visibility, success: boolean };
type ValueBlockState = { value: number };
class ValueBlock extends React.Component<ValueBlockProps, ValueBlockState> {
    constructor(props: ValueBlockProps) {
        super(props);
        this.state = {value: this.props.value};
        this.title = this.title.bind(this);
    }

    title() {
        return this.props.title.split("_").map(word => (word[0]?.toUpperCase() ?? '') + word.substr(1)).join(' ');
    }

    render() {
        let value = Math.round((this.props.value + Number.EPSILON) * 10000) / (this.props.type === InputType.PERCENT ? 1 : 10000);
        return (
            <div className={"block " + (this.props.visibility === Visibility.HIDDEN ? "hidden" : "")}>
            <div className="title">{this.title()}</div>
            <div className={"result " + (this.props.success ? "" : "error" )}><span className="prefix">{this.props.type === InputType.CURRENCY ? "$" : ""}</span>{value}<span className="suffix">{(this.props.type === InputType.PERCENT ? "%" : "")}</span></div>
            </div>
        );
    }
}

type InputBlockProps = { title: string, onChange: any, type: InputType };
type InputBlockState = { value: number, override: string | null, error: boolean};
class InputBlock extends React.Component<InputBlockProps, InputBlockState> {
    constructor(props: InputBlockProps) {
        super(props);
        this.state = {value: 0, override: null, error: false};
        this.title = this.title.bind(this);
        this.handleChange = this.handleChange.bind(this);
    }

    handleChange(event: any) {
        let value: number | null = parseFloat(event.target.value);
        this.setState({value, error: false});
        this.setState({override: null});
        if (!Number.isNaN(value) && event.target.value && event.target.value.endsWith(".")) {
            this.setState({value, override: event.target.value, error: false});
            this.props.onChange(value);
        }
        if (Number.isNaN(value) || value === undefined || value === null) {
            this.setState({value: 0, override: event.target.value, error: true});
        }
        this.props.onChange(value);
    }

    title() {
        return this.props.title.split("_").map(word => (word[0]?.toUpperCase() ?? '') + word.substr(1)).join(' ');
    }
 
    render() {
        return (
            <div className={"block " + (this.state.error ? "error" : "" )}>
            <div className="title">{this.title()}</div>
            {(this.props.type === InputType.CURRENCY ? <span className="currency">$</span> : "")}
            <input type='numeric' pattern="\d+\.?\d*" className="number-input" value={this.state.override ?? this.state.value} onChange={this.handleChange}></input>
            {(this.props.type === InputType.PERCENT ? <span className="percent">%</span> : "")}
            </div>
        );
    }
}

const example = `# Math Stuff

---

### Quadratic Equation

$a ; $b ; $c

x_1 = (-$b + sqrt(pow($b, 2) - 4 * $a * $c)) / 2 * $a ; x_2 = (-$b - sqrt(pow($b, 2) - 4 * $a * $c)) / 2 * $a

---

### Compound Interest

$principal$ ; $rate% ; $frequency

$years ; total_accumulated$ = $principal * pow(1 + $rate / $frequency, $frequency * $years)`

const theme = createTheme({
  theme: 'dark',
  settings: {
    background: 'rgba(0, 0, 0, 0)',
    foreground: '#4D4D4C',
    caret: '#AEAFAD',
    selection: '#BBBBBB',
    selectionMatch: '#BBBBBB',
    gutterBackground: '#FFFFFF',
    gutterForeground: '#4D4D4C',
    gutterBorder: '#dddddd',
    gutterActiveForeground: '',
    lineHighlight: 'rgba(0, 0, 0, 0)',
  },
  styles: [
    { tag: t.comment, color: '#787b80' },
    { tag: t.definition(t.typeName), color: '#194a7b' },
    { tag: t.typeName, class: 'bold token-currency' },
    { tag: t.tagName, class: 'bold token-percentage' },
    { tag: t.variableName, class: 'bold token-variable' },
    { tag: t.bool, class: 'token-function' },
    { tag: t.number, class: 'token-number' },
    { tag: t.heading, class: 'bold' },
    { tag: t.docComment, class: 'bold token-hidden' },
  ],
});

interface CalculrState { 
    state: number
}

const calculrLang = {
  name: "calculr",
  token: function (stream: StringStream) {
    if (stream.match(/[ =;]/)) return null;
    if (stream.pos == 0) {
      if (stream.match(/^#+.+/)) {
        return "heading";
      }
    }
    let style = null;
    if (stream.match(/\$\w+/)) {
        style = "variable";
    }
    if (stream.match(/@\w+/)) {
        style = "docComment"
    }
    if (style != null) {
      if (stream.eat(/%/)) {
        return "tag";
      } else if (stream.eat(/\$/)) {
        return "type";
      }
      return style;
    }
    if (stream.match(/\w+\$/)) {
        return "type";
    }
    if (stream.match(/\w+\%/)) {
        return "tag";
    }
    if (stream.match(/\d+/)) {
      return "number";
    }
    for (let name of replacements) {
        if (stream.match(name + "(", false)) {
            stream.match(name);
            return "bool";
        }
    }
    if (stream.match(/^Math\.\w+/)) {
      return "bool";
    }
    if (stream.match(/\w+/))
        return style;
    stream.next();
    return style;
  },
  languageData: {
    commentTokens: { line: "--", block: { open: "--[[", close: "]]--" } },
  },
};

type InputProps = { program: string; onValueChange: any };
class InputField extends React.Component<InputProps, any> {
  constructor(props: InputProps) {
    super(props);
    this.state = { value: "" };
    this.handleChange = this.handleChange.bind(this);
  }
  handleChange(event: any) {
    this.props.onValueChange(event);
  }

  render() {
    return (
      <div className="program-input">
        <CodeMirror
          basicSetup={{ lineNumbers: false, foldGutter: true }}
          theme={theme}
          extensions={[
            EditorView.lineWrapping,
            StreamLanguage.define(calculrLang),
          ]}
          height="100%"
          value={this.props.program}
          onChange={this.handleChange}
        />
      </div>
    );
  }
}

function isNumeric(str: any) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str as unknown as number) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

const replacements = [
  "floor",
  "ceil",
  "round",
  "sin",
  "cos",
  "tan",
  "sqrt",
  "pow",
];

type State = { program: string; blocks: any[]; overrides: any; layout: any[] };
class App extends React.Component<any, State> {
  constructor(props: any) {
    super(props);
    const { blocks, overrides} = this.renderBlocks(example, {});
    this.state = { program: example, blocks: blocks, overrides: overrides, layout: [] };
    this.loadProgram = this.loadProgram.bind(this);
    this.save = this.save.bind(this);
  }

  parse = (expr: string) => {
    replacements.forEach((replacement) => {
      expr = expr.replace(
        new RegExp(`${replacement}\\(`, "g"),
        `Math.${replacement}(`
      );
    });
    return expr;
  };

  eval = (values: any, thisLabel: string, expr: string, overrides?: any) => {
    if (expr === null || expr === undefined || expr.match(/^\s*$/))
      return { success: false, value: 0 };
    let string = this.parse(
      expr.replace(/\$\w+/g, (text: string) => {
        let label = text.substr(1);
        let value: number = 0;
        if (label !== thisLabel) value = values[label];
        if (value === null || value === undefined) value = 0;
        if (overrides !== undefined) {
          let override = overrides[label];
          if (override !== null && override !== undefined) {
            value = override.toString();
          }
        }
        if (isNumeric(value.toString())) return value.toString();
        else return "0";
      })
    );
    try {
      let value = eval(string);
      if (isNumeric(value.toString())) return { success: true, value };
      else return { success: false, value: 0 };
    } catch (e) {
      return { success: false, value: 0 };
    }
  };

  freeLabels = (blocks: any, row: any, expr: string) => {
    return Array.from(
      new Set<any>(
        Array.from(expr.matchAll(/\$(?<label>[\w_]+)/g))
          .filter(
            (match) =>
              [row, ...blocks].filter(
                (row: any) =>
                  row.filter(
                    (block: any) => block.label === match.groups?.label
                  ).length > 0
              ).length === 0
          )
          .map((match) => match[0].substr(1))
      )
    );
  };

  detectInputType = (label: string) => {
    if (label === undefined) return InputType.DEFAULT;
    switch (label[label.length - 1]) {
      case "%":
        return InputType.PERCENT;
      case "$":
        return InputType.CURRENCY;
      default:
        return InputType.DEFAULT;
    }
  };

  detectVisibility = (label: string) => {
    if (label === undefined) return Visibility.DEFAULT;
    switch (label[0]) {
      case "@":
        return Visibility.HIDDEN;
      default:
        return Visibility.DEFAULT;
    }
  };

  renderBlocks = (text: string, overrides?: any) => {
    let blocks: any[] = [];
    let values: any = {};
    let newOverrides: any = {};
    text.split("\n").forEach((line) => {
      let row: any[] = [];
      line.split(";").forEach((segment) => {
        segment = segment.trim();
        let match: any;
        if (
          (match = segment.match(
            /@?(?<label>[\w_]+)(?<type>[%$])?\s*=\s*(?<expr>.+)/
          ))
        ) {
          this.freeLabels(blocks, row, match.groups.expr).forEach((label) => {
            blocks.push([{ label: label, mode: "input" }]);
            if (overrides.hasOwnProperty(label))
              newOverrides[label] = overrides[label];
            else newOverrides[label] = 0;
          });
          let value, success;
          ({ value, success } = this.eval(
            values,
            match.groups.label,
            match.groups.expr,
            { ...overrides, ...newOverrides }
          ));
          values[match.groups.label] = value;
          row.push({
            label: match.groups.label,
            success,
            mode: "value",
            value: values[match.groups.label],
            type: this.detectInputType(match.groups.type),
            visibility: this.detectVisibility(match[0]),
          });
        } else if ((match = segment.match(/^\$(?<label>[\w_]+)[%$]?$/))) {
          row.push({
            label: match.groups.label,
            mode: "input",
            type: this.detectInputType(match[0]),
          });
          if (overrides.hasOwnProperty(match.groups.label))
            newOverrides[match.groups.label] = overrides[match.groups.label];
          else newOverrides[match.groups.label] = 0;
        } else if ((match = segment.match(/---/))) {
          row.push({ mode: "separator" });
        } else if ((match = segment.match(/^(?<count>#+)\s*(?<title>.+)$/))) {
          row.push({
            mode: "title",
            title: match.groups.title,
            count: match.groups.count.length,
          });
        }
      });
      if (row.length > 0) blocks.push(row);
    });
    return { blocks, overrides: newOverrides };
  };

  onValueChange = (program: string) => {
    this.setState((state) => {
      return { program, ...this.renderBlocks(program, state.overrides) };
    });
  };

  onInputChange = (label: string, value: number, type: InputType) => {
    let overrides = { ...this.state.overrides };
    overrides[label] = value / (type === InputType.PERCENT ? 100 : 1);
    this.setState((state) => {
      return { ...this.renderBlocks(state.program, overrides) };
    });
  };

  makeRow = (row: any, i: number) => {
    let j: number = 0;
    return (
      <div className={"block-row" + (row.filter((block: any) => block.visibility != Visibility.HIDDEN).length > 0 ? "" : " hidden")} key={i}>
        {row.map((block: any) => this.makeBlock(block, j++))}
      </div>
    );
  };

  makeBlock = (block: any, i: number) => {
    switch (block.mode) {
      case "input":
        return (
          <InputBlock
            key={block.label + i}
            title={block.label}
            type={block.type}
            onChange={(value: number) =>
              this.onInputChange(block.label, value, block.type)
            }
          />
        );
      case "value":
        return (
          <ValueBlock
            key={block.label + i}
            value={block.value}
            title={block.label}
            type={block.type}
            success={block.success}
            visibility={block.visibility}
          />
        );
      case "separator":
        return <div className="hsep" key={i}></div>;
      case "title":
        return (
          <div
            className={"h" + Math.max(Math.min(block.count, 6), 1)}
            key={block.title + i}
          >
            {block.title}
          </div>
        );
    }
  };

  loadProgram(calculator: Calculator) {
    if (calculator === undefined) return;
    this.setState({ program: calculator.program });
    this.onValueChange(calculator.program);
  }

  save(name: string) {
    if (name == "") return;
    let calculators = collection(db, "calculators");
    addDoc(calculators, {
      title: name,
      program: this.state.program
    })
  }

  render = () => {
    let i = 0;
    return (
      <main className="app">
        <Menu loadProgram={this.loadProgram} save={this.save}></Menu>
        <div className='hsep'></div>
        <InputField
          program={this.state.program}
          onValueChange={this.onValueChange}
        />
        <div className="sep"></div>
        <div className="display">
          {this.state.blocks.map((row: any) => this.makeRow(row, i++))}
        </div>
      </main>
    );
  };
}

/*
# How Many to Sell?
---
$base_price$;$discount%;sell_price$=$base_price/(1-$discount)
$trader_money$;sell_amount=floor($trader_money/$sell_price)
*/

export default App;
