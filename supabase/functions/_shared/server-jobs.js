var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/decimal.js-light/decimal.js
var require_decimal = __commonJS({
  "node_modules/decimal.js-light/decimal.js"(exports, module) {
    (function(globalScope) {
      "use strict";
      var MAX_DIGITS = 1e9, Decimal2 = {
        // These values must be integers within the stated ranges (inclusive).
        // Most of these values can be changed during run-time using `Decimal.config`.
        // The maximum number of significant digits of the result of a calculation or base conversion.
        // E.g. `Decimal.config({ precision: 20 });`
        precision: 20,
        // 1 to MAX_DIGITS
        // The rounding mode used by default by `toInteger`, `toDecimalPlaces`, `toExponential`,
        // `toFixed`, `toPrecision` and `toSignificantDigits`.
        //
        // ROUND_UP         0 Away from zero.
        // ROUND_DOWN       1 Towards zero.
        // ROUND_CEIL       2 Towards +Infinity.
        // ROUND_FLOOR      3 Towards -Infinity.
        // ROUND_HALF_UP    4 Towards nearest neighbour. If equidistant, up.
        // ROUND_HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
        // ROUND_HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
        // ROUND_HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
        // ROUND_HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
        //
        // E.g.
        // `Decimal.rounding = 4;`
        // `Decimal.rounding = Decimal.ROUND_HALF_UP;`
        rounding: 4,
        // 0 to 8
        // The exponent value at and beneath which `toString` returns exponential notation.
        // JavaScript numbers: -7
        toExpNeg: -7,
        // 0 to -MAX_E
        // The exponent value at and above which `toString` returns exponential notation.
        // JavaScript numbers: 21
        toExpPos: 21,
        // 0 to MAX_E
        // The natural logarithm of 10.
        // 115 digits
        LN10: "2.302585092994045684017991454684364207601101488628772976033327900967572609677352480235997205089598298341967784042286"
      }, external = true, decimalError = "[DecimalError] ", invalidArgument = decimalError + "Invalid argument: ", exponentOutOfRange = decimalError + "Exponent out of range: ", mathfloor = Math.floor, mathpow = Math.pow, isDecimal = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, ONE, BASE = 1e7, LOG_BASE = 7, MAX_SAFE_INTEGER = 9007199254740991, MAX_E = mathfloor(MAX_SAFE_INTEGER / LOG_BASE), P = {};
      P.absoluteValue = P.abs = function() {
        var x = new this.constructor(this);
        if (x.s) x.s = 1;
        return x;
      };
      P.comparedTo = P.cmp = function(y) {
        var i, j, xdL, ydL, x = this;
        y = new x.constructor(y);
        if (x.s !== y.s) return x.s || -y.s;
        if (x.e !== y.e) return x.e > y.e ^ x.s < 0 ? 1 : -1;
        xdL = x.d.length;
        ydL = y.d.length;
        for (i = 0, j = xdL < ydL ? xdL : ydL; i < j; ++i) {
          if (x.d[i] !== y.d[i]) return x.d[i] > y.d[i] ^ x.s < 0 ? 1 : -1;
        }
        return xdL === ydL ? 0 : xdL > ydL ^ x.s < 0 ? 1 : -1;
      };
      P.decimalPlaces = P.dp = function() {
        var x = this, w = x.d.length - 1, dp = (w - x.e) * LOG_BASE;
        w = x.d[w];
        if (w) for (; w % 10 == 0; w /= 10) dp--;
        return dp < 0 ? 0 : dp;
      };
      P.dividedBy = P.div = function(y) {
        return divide(this, new this.constructor(y));
      };
      P.dividedToIntegerBy = P.idiv = function(y) {
        var x = this, Ctor = x.constructor;
        return round(divide(x, new Ctor(y), 0, 1), Ctor.precision);
      };
      P.equals = P.eq = function(y) {
        return !this.cmp(y);
      };
      P.exponent = function() {
        return getBase10Exponent(this);
      };
      P.greaterThan = P.gt = function(y) {
        return this.cmp(y) > 0;
      };
      P.greaterThanOrEqualTo = P.gte = function(y) {
        return this.cmp(y) >= 0;
      };
      P.isInteger = P.isint = function() {
        return this.e > this.d.length - 2;
      };
      P.isNegative = P.isneg = function() {
        return this.s < 0;
      };
      P.isPositive = P.ispos = function() {
        return this.s > 0;
      };
      P.isZero = function() {
        return this.s === 0;
      };
      P.lessThan = P.lt = function(y) {
        return this.cmp(y) < 0;
      };
      P.lessThanOrEqualTo = P.lte = function(y) {
        return this.cmp(y) < 1;
      };
      P.logarithm = P.log = function(base) {
        var r, x = this, Ctor = x.constructor, pr = Ctor.precision, wpr = pr + 5;
        if (base === void 0) {
          base = new Ctor(10);
        } else {
          base = new Ctor(base);
          if (base.s < 1 || base.eq(ONE)) throw Error(decimalError + "NaN");
        }
        if (x.s < 1) throw Error(decimalError + (x.s ? "NaN" : "-Infinity"));
        if (x.eq(ONE)) return new Ctor(0);
        external = false;
        r = divide(ln(x, wpr), ln(base, wpr), wpr);
        external = true;
        return round(r, pr);
      };
      P.minus = P.sub = function(y) {
        var x = this;
        y = new x.constructor(y);
        return x.s == y.s ? subtract(x, y) : add(x, (y.s = -y.s, y));
      };
      P.modulo = P.mod = function(y) {
        var q, x = this, Ctor = x.constructor, pr = Ctor.precision;
        y = new Ctor(y);
        if (!y.s) throw Error(decimalError + "NaN");
        if (!x.s) return round(new Ctor(x), pr);
        external = false;
        q = divide(x, y, 0, 1).times(y);
        external = true;
        return x.minus(q);
      };
      P.naturalExponential = P.exp = function() {
        return exp(this);
      };
      P.naturalLogarithm = P.ln = function() {
        return ln(this);
      };
      P.negated = P.neg = function() {
        var x = new this.constructor(this);
        x.s = -x.s || 0;
        return x;
      };
      P.plus = P.add = function(y) {
        var x = this;
        y = new x.constructor(y);
        return x.s == y.s ? add(x, y) : subtract(x, (y.s = -y.s, y));
      };
      P.precision = P.sd = function(z) {
        var e, sd, w, x = this;
        if (z !== void 0 && z !== !!z && z !== 1 && z !== 0) throw Error(invalidArgument + z);
        e = getBase10Exponent(x) + 1;
        w = x.d.length - 1;
        sd = w * LOG_BASE + 1;
        w = x.d[w];
        if (w) {
          for (; w % 10 == 0; w /= 10) sd--;
          for (w = x.d[0]; w >= 10; w /= 10) sd++;
        }
        return z && e > sd ? e : sd;
      };
      P.squareRoot = P.sqrt = function() {
        var e, n, pr, r, s, t, wpr, x = this, Ctor = x.constructor;
        if (x.s < 1) {
          if (!x.s) return new Ctor(0);
          throw Error(decimalError + "NaN");
        }
        e = getBase10Exponent(x);
        external = false;
        s = Math.sqrt(+x);
        if (s == 0 || s == 1 / 0) {
          n = digitsToString(x.d);
          if ((n.length + e) % 2 == 0) n += "0";
          s = Math.sqrt(n);
          e = mathfloor((e + 1) / 2) - (e < 0 || e % 2);
          if (s == 1 / 0) {
            n = "5e" + e;
          } else {
            n = s.toExponential();
            n = n.slice(0, n.indexOf("e") + 1) + e;
          }
          r = new Ctor(n);
        } else {
          r = new Ctor(s.toString());
        }
        pr = Ctor.precision;
        s = wpr = pr + 3;
        for (; ; ) {
          t = r;
          r = t.plus(divide(x, t, wpr + 2)).times(0.5);
          if (digitsToString(t.d).slice(0, wpr) === (n = digitsToString(r.d)).slice(0, wpr)) {
            n = n.slice(wpr - 3, wpr + 1);
            if (s == wpr && n == "4999") {
              round(t, pr + 1, 0);
              if (t.times(t).eq(x)) {
                r = t;
                break;
              }
            } else if (n != "9999") {
              break;
            }
            wpr += 4;
          }
        }
        external = true;
        return round(r, pr);
      };
      P.times = P.mul = function(y) {
        var carry, e, i, k, r, rL, t, xdL, ydL, x = this, Ctor = x.constructor, xd = x.d, yd = (y = new Ctor(y)).d;
        if (!x.s || !y.s) return new Ctor(0);
        y.s *= x.s;
        e = x.e + y.e;
        xdL = xd.length;
        ydL = yd.length;
        if (xdL < ydL) {
          r = xd;
          xd = yd;
          yd = r;
          rL = xdL;
          xdL = ydL;
          ydL = rL;
        }
        r = [];
        rL = xdL + ydL;
        for (i = rL; i--; ) r.push(0);
        for (i = ydL; --i >= 0; ) {
          carry = 0;
          for (k = xdL + i; k > i; ) {
            t = r[k] + yd[i] * xd[k - i - 1] + carry;
            r[k--] = t % BASE | 0;
            carry = t / BASE | 0;
          }
          r[k] = (r[k] + carry) % BASE | 0;
        }
        for (; !r[--rL]; ) r.pop();
        if (carry) ++e;
        else r.shift();
        y.d = r;
        y.e = e;
        return external ? round(y, Ctor.precision) : y;
      };
      P.toDecimalPlaces = P.todp = function(dp, rm) {
        var x = this, Ctor = x.constructor;
        x = new Ctor(x);
        if (dp === void 0) return x;
        checkInt32(dp, 0, MAX_DIGITS);
        if (rm === void 0) rm = Ctor.rounding;
        else checkInt32(rm, 0, 8);
        return round(x, dp + getBase10Exponent(x) + 1, rm);
      };
      P.toExponential = function(dp, rm) {
        var str, x = this, Ctor = x.constructor;
        if (dp === void 0) {
          str = toString(x, true);
        } else {
          checkInt32(dp, 0, MAX_DIGITS);
          if (rm === void 0) rm = Ctor.rounding;
          else checkInt32(rm, 0, 8);
          x = round(new Ctor(x), dp + 1, rm);
          str = toString(x, true, dp + 1);
        }
        return str;
      };
      P.toFixed = function(dp, rm) {
        var str, y, x = this, Ctor = x.constructor;
        if (dp === void 0) return toString(x);
        checkInt32(dp, 0, MAX_DIGITS);
        if (rm === void 0) rm = Ctor.rounding;
        else checkInt32(rm, 0, 8);
        y = round(new Ctor(x), dp + getBase10Exponent(x) + 1, rm);
        str = toString(y.abs(), false, dp + getBase10Exponent(y) + 1);
        return x.isneg() && !x.isZero() ? "-" + str : str;
      };
      P.toInteger = P.toint = function() {
        var x = this, Ctor = x.constructor;
        return round(new Ctor(x), getBase10Exponent(x) + 1, Ctor.rounding);
      };
      P.toNumber = function() {
        return +this;
      };
      P.toPower = P.pow = function(y) {
        var e, k, pr, r, sign, yIsInt, x = this, Ctor = x.constructor, guard = 12, yn = +(y = new Ctor(y));
        if (!y.s) return new Ctor(ONE);
        x = new Ctor(x);
        if (!x.s) {
          if (y.s < 1) throw Error(decimalError + "Infinity");
          return x;
        }
        if (x.eq(ONE)) return x;
        pr = Ctor.precision;
        if (y.eq(ONE)) return round(x, pr);
        e = y.e;
        k = y.d.length - 1;
        yIsInt = e >= k;
        sign = x.s;
        if (!yIsInt) {
          if (sign < 0) throw Error(decimalError + "NaN");
        } else if ((k = yn < 0 ? -yn : yn) <= MAX_SAFE_INTEGER) {
          r = new Ctor(ONE);
          e = Math.ceil(pr / LOG_BASE + 4);
          external = false;
          for (; ; ) {
            if (k % 2) {
              r = r.times(x);
              truncate(r.d, e);
            }
            k = mathfloor(k / 2);
            if (k === 0) break;
            x = x.times(x);
            truncate(x.d, e);
          }
          external = true;
          return y.s < 0 ? new Ctor(ONE).div(r) : round(r, pr);
        }
        sign = sign < 0 && y.d[Math.max(e, k)] & 1 ? -1 : 1;
        x.s = 1;
        external = false;
        r = y.times(ln(x, pr + guard));
        external = true;
        r = exp(r);
        r.s = sign;
        return r;
      };
      P.toPrecision = function(sd, rm) {
        var e, str, x = this, Ctor = x.constructor;
        if (sd === void 0) {
          e = getBase10Exponent(x);
          str = toString(x, e <= Ctor.toExpNeg || e >= Ctor.toExpPos);
        } else {
          checkInt32(sd, 1, MAX_DIGITS);
          if (rm === void 0) rm = Ctor.rounding;
          else checkInt32(rm, 0, 8);
          x = round(new Ctor(x), sd, rm);
          e = getBase10Exponent(x);
          str = toString(x, sd <= e || e <= Ctor.toExpNeg, sd);
        }
        return str;
      };
      P.toSignificantDigits = P.tosd = function(sd, rm) {
        var x = this, Ctor = x.constructor;
        if (sd === void 0) {
          sd = Ctor.precision;
          rm = Ctor.rounding;
        } else {
          checkInt32(sd, 1, MAX_DIGITS);
          if (rm === void 0) rm = Ctor.rounding;
          else checkInt32(rm, 0, 8);
        }
        return round(new Ctor(x), sd, rm);
      };
      P.toString = P.valueOf = P.val = P.toJSON = function() {
        var x = this, e = getBase10Exponent(x), Ctor = x.constructor;
        return toString(x, e <= Ctor.toExpNeg || e >= Ctor.toExpPos);
      };
      function add(x, y) {
        var carry, d, e, i, k, len, xd, yd, Ctor = x.constructor, pr = Ctor.precision;
        if (!x.s || !y.s) {
          if (!y.s) y = new Ctor(x);
          return external ? round(y, pr) : y;
        }
        xd = x.d;
        yd = y.d;
        k = x.e;
        e = y.e;
        xd = xd.slice();
        i = k - e;
        if (i) {
          if (i < 0) {
            d = xd;
            i = -i;
            len = yd.length;
          } else {
            d = yd;
            e = k;
            len = xd.length;
          }
          k = Math.ceil(pr / LOG_BASE);
          len = k > len ? k + 1 : len + 1;
          if (i > len) {
            i = len;
            d.length = 1;
          }
          d.reverse();
          for (; i--; ) d.push(0);
          d.reverse();
        }
        len = xd.length;
        i = yd.length;
        if (len - i < 0) {
          i = len;
          d = yd;
          yd = xd;
          xd = d;
        }
        for (carry = 0; i; ) {
          carry = (xd[--i] = xd[i] + yd[i] + carry) / BASE | 0;
          xd[i] %= BASE;
        }
        if (carry) {
          xd.unshift(carry);
          ++e;
        }
        for (len = xd.length; xd[--len] == 0; ) xd.pop();
        y.d = xd;
        y.e = e;
        return external ? round(y, pr) : y;
      }
      function checkInt32(i, min, max) {
        if (i !== ~~i || i < min || i > max) {
          throw Error(invalidArgument + i);
        }
      }
      function digitsToString(d) {
        var i, k, ws, indexOfLastWord = d.length - 1, str = "", w = d[0];
        if (indexOfLastWord > 0) {
          str += w;
          for (i = 1; i < indexOfLastWord; i++) {
            ws = d[i] + "";
            k = LOG_BASE - ws.length;
            if (k) str += getZeroString(k);
            str += ws;
          }
          w = d[i];
          ws = w + "";
          k = LOG_BASE - ws.length;
          if (k) str += getZeroString(k);
        } else if (w === 0) {
          return "0";
        }
        for (; w % 10 === 0; ) w /= 10;
        return str + w;
      }
      var divide = /* @__PURE__ */ (function() {
        function multiplyInteger(x, k) {
          var temp, carry = 0, i = x.length;
          for (x = x.slice(); i--; ) {
            temp = x[i] * k + carry;
            x[i] = temp % BASE | 0;
            carry = temp / BASE | 0;
          }
          if (carry) x.unshift(carry);
          return x;
        }
        function compare(a, b, aL, bL) {
          var i, r;
          if (aL != bL) {
            r = aL > bL ? 1 : -1;
          } else {
            for (i = r = 0; i < aL; i++) {
              if (a[i] != b[i]) {
                r = a[i] > b[i] ? 1 : -1;
                break;
              }
            }
          }
          return r;
        }
        function subtract2(a, b, aL) {
          var i = 0;
          for (; aL--; ) {
            a[aL] -= i;
            i = a[aL] < b[aL] ? 1 : 0;
            a[aL] = i * BASE + a[aL] - b[aL];
          }
          for (; !a[0] && a.length > 1; ) a.shift();
        }
        return function(x, y, pr, dp) {
          var cmp, e, i, k, prod, prodL, q, qd, rem, remL, rem0, sd, t, xi, xL, yd0, yL, yz, Ctor = x.constructor, sign = x.s == y.s ? 1 : -1, xd = x.d, yd = y.d;
          if (!x.s) return new Ctor(x);
          if (!y.s) throw Error(decimalError + "Division by zero");
          e = x.e - y.e;
          yL = yd.length;
          xL = xd.length;
          q = new Ctor(sign);
          qd = q.d = [];
          for (i = 0; yd[i] == (xd[i] || 0); ) ++i;
          if (yd[i] > (xd[i] || 0)) --e;
          if (pr == null) {
            sd = pr = Ctor.precision;
          } else if (dp) {
            sd = pr + (getBase10Exponent(x) - getBase10Exponent(y)) + 1;
          } else {
            sd = pr;
          }
          if (sd < 0) return new Ctor(0);
          sd = sd / LOG_BASE + 2 | 0;
          i = 0;
          if (yL == 1) {
            k = 0;
            yd = yd[0];
            sd++;
            for (; (i < xL || k) && sd--; i++) {
              t = k * BASE + (xd[i] || 0);
              qd[i] = t / yd | 0;
              k = t % yd | 0;
            }
          } else {
            k = BASE / (yd[0] + 1) | 0;
            if (k > 1) {
              yd = multiplyInteger(yd, k);
              xd = multiplyInteger(xd, k);
              yL = yd.length;
              xL = xd.length;
            }
            xi = yL;
            rem = xd.slice(0, yL);
            remL = rem.length;
            for (; remL < yL; ) rem[remL++] = 0;
            yz = yd.slice();
            yz.unshift(0);
            yd0 = yd[0];
            if (yd[1] >= BASE / 2) ++yd0;
            do {
              k = 0;
              cmp = compare(yd, rem, yL, remL);
              if (cmp < 0) {
                rem0 = rem[0];
                if (yL != remL) rem0 = rem0 * BASE + (rem[1] || 0);
                k = rem0 / yd0 | 0;
                if (k > 1) {
                  if (k >= BASE) k = BASE - 1;
                  prod = multiplyInteger(yd, k);
                  prodL = prod.length;
                  remL = rem.length;
                  cmp = compare(prod, rem, prodL, remL);
                  if (cmp == 1) {
                    k--;
                    subtract2(prod, yL < prodL ? yz : yd, prodL);
                  }
                } else {
                  if (k == 0) cmp = k = 1;
                  prod = yd.slice();
                }
                prodL = prod.length;
                if (prodL < remL) prod.unshift(0);
                subtract2(rem, prod, remL);
                if (cmp == -1) {
                  remL = rem.length;
                  cmp = compare(yd, rem, yL, remL);
                  if (cmp < 1) {
                    k++;
                    subtract2(rem, yL < remL ? yz : yd, remL);
                  }
                }
                remL = rem.length;
              } else if (cmp === 0) {
                k++;
                rem = [0];
              }
              qd[i++] = k;
              if (cmp && rem[0]) {
                rem[remL++] = xd[xi] || 0;
              } else {
                rem = [xd[xi]];
                remL = 1;
              }
            } while ((xi++ < xL || rem[0] !== void 0) && sd--);
          }
          if (!qd[0]) qd.shift();
          q.e = e;
          return round(q, dp ? pr + getBase10Exponent(q) + 1 : pr);
        };
      })();
      function exp(x, sd) {
        var denominator, guard, pow, sum, t, wpr, i = 0, k = 0, Ctor = x.constructor, pr = Ctor.precision;
        if (getBase10Exponent(x) > 16) throw Error(exponentOutOfRange + getBase10Exponent(x));
        if (!x.s) return new Ctor(ONE);
        if (sd == null) {
          external = false;
          wpr = pr;
        } else {
          wpr = sd;
        }
        t = new Ctor(0.03125);
        while (x.abs().gte(0.1)) {
          x = x.times(t);
          k += 5;
        }
        guard = Math.log(mathpow(2, k)) / Math.LN10 * 2 + 5 | 0;
        wpr += guard;
        denominator = pow = sum = new Ctor(ONE);
        Ctor.precision = wpr;
        for (; ; ) {
          pow = round(pow.times(x), wpr);
          denominator = denominator.times(++i);
          t = sum.plus(divide(pow, denominator, wpr));
          if (digitsToString(t.d).slice(0, wpr) === digitsToString(sum.d).slice(0, wpr)) {
            while (k--) sum = round(sum.times(sum), wpr);
            Ctor.precision = pr;
            return sd == null ? (external = true, round(sum, pr)) : sum;
          }
          sum = t;
        }
      }
      function getBase10Exponent(x) {
        var e = x.e * LOG_BASE, w = x.d[0];
        for (; w >= 10; w /= 10) e++;
        return e;
      }
      function getLn10(Ctor, sd, pr) {
        if (sd > Ctor.LN10.sd()) {
          external = true;
          if (pr) Ctor.precision = pr;
          throw Error(decimalError + "LN10 precision limit exceeded");
        }
        return round(new Ctor(Ctor.LN10), sd);
      }
      function getZeroString(k) {
        var zs = "";
        for (; k--; ) zs += "0";
        return zs;
      }
      function ln(y, sd) {
        var c, c0, denominator, e, numerator, sum, t, wpr, x2, n = 1, guard = 10, x = y, xd = x.d, Ctor = x.constructor, pr = Ctor.precision;
        if (x.s < 1) throw Error(decimalError + (x.s ? "NaN" : "-Infinity"));
        if (x.eq(ONE)) return new Ctor(0);
        if (sd == null) {
          external = false;
          wpr = pr;
        } else {
          wpr = sd;
        }
        if (x.eq(10)) {
          if (sd == null) external = true;
          return getLn10(Ctor, wpr);
        }
        wpr += guard;
        Ctor.precision = wpr;
        c = digitsToString(xd);
        c0 = c.charAt(0);
        e = getBase10Exponent(x);
        if (Math.abs(e) < 15e14) {
          while (c0 < 7 && c0 != 1 || c0 == 1 && c.charAt(1) > 3) {
            x = x.times(y);
            c = digitsToString(x.d);
            c0 = c.charAt(0);
            n++;
          }
          e = getBase10Exponent(x);
          if (c0 > 1) {
            x = new Ctor("0." + c);
            e++;
          } else {
            x = new Ctor(c0 + "." + c.slice(1));
          }
        } else {
          t = getLn10(Ctor, wpr + 2, pr).times(e + "");
          x = ln(new Ctor(c0 + "." + c.slice(1)), wpr - guard).plus(t);
          Ctor.precision = pr;
          return sd == null ? (external = true, round(x, pr)) : x;
        }
        sum = numerator = x = divide(x.minus(ONE), x.plus(ONE), wpr);
        x2 = round(x.times(x), wpr);
        denominator = 3;
        for (; ; ) {
          numerator = round(numerator.times(x2), wpr);
          t = sum.plus(divide(numerator, new Ctor(denominator), wpr));
          if (digitsToString(t.d).slice(0, wpr) === digitsToString(sum.d).slice(0, wpr)) {
            sum = sum.times(2);
            if (e !== 0) sum = sum.plus(getLn10(Ctor, wpr + 2, pr).times(e + ""));
            sum = divide(sum, new Ctor(n), wpr);
            Ctor.precision = pr;
            return sd == null ? (external = true, round(sum, pr)) : sum;
          }
          sum = t;
          denominator += 2;
        }
      }
      function parseDecimal(x, str) {
        var e, i, len;
        if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
        if ((i = str.search(/e/i)) > 0) {
          if (e < 0) e = i;
          e += +str.slice(i + 1);
          str = str.substring(0, i);
        } else if (e < 0) {
          e = str.length;
        }
        for (i = 0; str.charCodeAt(i) === 48; ) ++i;
        for (len = str.length; str.charCodeAt(len - 1) === 48; ) --len;
        str = str.slice(i, len);
        if (str) {
          len -= i;
          e = e - i - 1;
          x.e = mathfloor(e / LOG_BASE);
          x.d = [];
          i = (e + 1) % LOG_BASE;
          if (e < 0) i += LOG_BASE;
          if (i < len) {
            if (i) x.d.push(+str.slice(0, i));
            for (len -= LOG_BASE; i < len; ) x.d.push(+str.slice(i, i += LOG_BASE));
            str = str.slice(i);
            i = LOG_BASE - str.length;
          } else {
            i -= len;
          }
          for (; i--; ) str += "0";
          x.d.push(+str);
          if (external && (x.e > MAX_E || x.e < -MAX_E)) throw Error(exponentOutOfRange + e);
        } else {
          x.s = 0;
          x.e = 0;
          x.d = [0];
        }
        return x;
      }
      function round(x, sd, rm) {
        var i, j, k, n, rd, doRound, w, xdi, xd = x.d;
        for (n = 1, k = xd[0]; k >= 10; k /= 10) n++;
        i = sd - n;
        if (i < 0) {
          i += LOG_BASE;
          j = sd;
          w = xd[xdi = 0];
        } else {
          xdi = Math.ceil((i + 1) / LOG_BASE);
          k = xd.length;
          if (xdi >= k) return x;
          w = k = xd[xdi];
          for (n = 1; k >= 10; k /= 10) n++;
          i %= LOG_BASE;
          j = i - LOG_BASE + n;
        }
        if (rm !== void 0) {
          k = mathpow(10, n - j - 1);
          rd = w / k % 10 | 0;
          doRound = sd < 0 || xd[xdi + 1] !== void 0 || w % k;
          doRound = rm < 4 ? (rd || doRound) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : rd > 5 || rd == 5 && (rm == 4 || doRound || rm == 6 && // Check whether the digit to the left of the rounding digit is odd.
          (i > 0 ? j > 0 ? w / mathpow(10, n - j) : 0 : xd[xdi - 1]) % 10 & 1 || rm == (x.s < 0 ? 8 : 7));
        }
        if (sd < 1 || !xd[0]) {
          if (doRound) {
            k = getBase10Exponent(x);
            xd.length = 1;
            sd = sd - k - 1;
            xd[0] = mathpow(10, (LOG_BASE - sd % LOG_BASE) % LOG_BASE);
            x.e = mathfloor(-sd / LOG_BASE) || 0;
          } else {
            xd.length = 1;
            xd[0] = x.e = x.s = 0;
          }
          return x;
        }
        if (i == 0) {
          xd.length = xdi;
          k = 1;
          xdi--;
        } else {
          xd.length = xdi + 1;
          k = mathpow(10, LOG_BASE - i);
          xd[xdi] = j > 0 ? (w / mathpow(10, n - j) % mathpow(10, j) | 0) * k : 0;
        }
        if (doRound) {
          for (; ; ) {
            if (xdi == 0) {
              if ((xd[0] += k) == BASE) {
                xd[0] = 1;
                ++x.e;
              }
              break;
            } else {
              xd[xdi] += k;
              if (xd[xdi] != BASE) break;
              xd[xdi--] = 0;
              k = 1;
            }
          }
        }
        for (i = xd.length; xd[--i] === 0; ) xd.pop();
        if (external && (x.e > MAX_E || x.e < -MAX_E)) {
          throw Error(exponentOutOfRange + getBase10Exponent(x));
        }
        return x;
      }
      function subtract(x, y) {
        var d, e, i, j, k, len, xd, xe, xLTy, yd, Ctor = x.constructor, pr = Ctor.precision;
        if (!x.s || !y.s) {
          if (y.s) y.s = -y.s;
          else y = new Ctor(x);
          return external ? round(y, pr) : y;
        }
        xd = x.d;
        yd = y.d;
        e = y.e;
        xe = x.e;
        xd = xd.slice();
        k = xe - e;
        if (k) {
          xLTy = k < 0;
          if (xLTy) {
            d = xd;
            k = -k;
            len = yd.length;
          } else {
            d = yd;
            e = xe;
            len = xd.length;
          }
          i = Math.max(Math.ceil(pr / LOG_BASE), len) + 2;
          if (k > i) {
            k = i;
            d.length = 1;
          }
          d.reverse();
          for (i = k; i--; ) d.push(0);
          d.reverse();
        } else {
          i = xd.length;
          len = yd.length;
          xLTy = i < len;
          if (xLTy) len = i;
          for (i = 0; i < len; i++) {
            if (xd[i] != yd[i]) {
              xLTy = xd[i] < yd[i];
              break;
            }
          }
          k = 0;
        }
        if (xLTy) {
          d = xd;
          xd = yd;
          yd = d;
          y.s = -y.s;
        }
        len = xd.length;
        for (i = yd.length - len; i > 0; --i) xd[len++] = 0;
        for (i = yd.length; i > k; ) {
          if (xd[--i] < yd[i]) {
            for (j = i; j && xd[--j] === 0; ) xd[j] = BASE - 1;
            --xd[j];
            xd[i] += BASE;
          }
          xd[i] -= yd[i];
        }
        for (; xd[--len] === 0; ) xd.pop();
        for (; xd[0] === 0; xd.shift()) --e;
        if (!xd[0]) return new Ctor(0);
        y.d = xd;
        y.e = e;
        return external ? round(y, pr) : y;
      }
      function toString(x, isExp, sd) {
        var k, e = getBase10Exponent(x), str = digitsToString(x.d), len = str.length;
        if (isExp) {
          if (sd && (k = sd - len) > 0) {
            str = str.charAt(0) + "." + str.slice(1) + getZeroString(k);
          } else if (len > 1) {
            str = str.charAt(0) + "." + str.slice(1);
          }
          str = str + (e < 0 ? "e" : "e+") + e;
        } else if (e < 0) {
          str = "0." + getZeroString(-e - 1) + str;
          if (sd && (k = sd - len) > 0) str += getZeroString(k);
        } else if (e >= len) {
          str += getZeroString(e + 1 - len);
          if (sd && (k = sd - e - 1) > 0) str = str + "." + getZeroString(k);
        } else {
          if ((k = e + 1) < len) str = str.slice(0, k) + "." + str.slice(k);
          if (sd && (k = sd - len) > 0) {
            if (e + 1 === len) str += ".";
            str += getZeroString(k);
          }
        }
        return x.s < 0 ? "-" + str : str;
      }
      function truncate(arr, len) {
        if (arr.length > len) {
          arr.length = len;
          return true;
        }
      }
      function clone(obj) {
        var i, p, ps;
        function Decimal3(value) {
          var x = this;
          if (!(x instanceof Decimal3)) return new Decimal3(value);
          x.constructor = Decimal3;
          if (value instanceof Decimal3) {
            x.s = value.s;
            x.e = value.e;
            x.d = (value = value.d) ? value.slice() : value;
            return;
          }
          if (typeof value === "number") {
            if (value * 0 !== 0) {
              throw Error(invalidArgument + value);
            }
            if (value > 0) {
              x.s = 1;
            } else if (value < 0) {
              value = -value;
              x.s = -1;
            } else {
              x.s = 0;
              x.e = 0;
              x.d = [0];
              return;
            }
            if (value === ~~value && value < 1e7) {
              x.e = 0;
              x.d = [value];
              return;
            }
            return parseDecimal(x, value.toString());
          } else if (typeof value !== "string") {
            throw Error(invalidArgument + value);
          }
          if (value.charCodeAt(0) === 45) {
            value = value.slice(1);
            x.s = -1;
          } else {
            x.s = 1;
          }
          if (isDecimal.test(value)) parseDecimal(x, value);
          else throw Error(invalidArgument + value);
        }
        Decimal3.prototype = P;
        Decimal3.ROUND_UP = 0;
        Decimal3.ROUND_DOWN = 1;
        Decimal3.ROUND_CEIL = 2;
        Decimal3.ROUND_FLOOR = 3;
        Decimal3.ROUND_HALF_UP = 4;
        Decimal3.ROUND_HALF_DOWN = 5;
        Decimal3.ROUND_HALF_EVEN = 6;
        Decimal3.ROUND_HALF_CEIL = 7;
        Decimal3.ROUND_HALF_FLOOR = 8;
        Decimal3.clone = clone;
        Decimal3.config = Decimal3.set = config;
        if (obj === void 0) obj = {};
        if (obj) {
          ps = ["precision", "rounding", "toExpNeg", "toExpPos", "LN10"];
          for (i = 0; i < ps.length; ) if (!obj.hasOwnProperty(p = ps[i++])) obj[p] = this[p];
        }
        Decimal3.config(obj);
        return Decimal3;
      }
      function config(obj) {
        if (!obj || typeof obj !== "object") {
          throw Error(decimalError + "Object expected");
        }
        var i, p, v, ps = [
          "precision",
          1,
          MAX_DIGITS,
          "rounding",
          0,
          8,
          "toExpNeg",
          -1 / 0,
          0,
          "toExpPos",
          0,
          1 / 0
        ];
        for (i = 0; i < ps.length; i += 3) {
          if ((v = obj[p = ps[i]]) !== void 0) {
            if (mathfloor(v) === v && v >= ps[i + 1] && v <= ps[i + 2]) this[p] = v;
            else throw Error(invalidArgument + p + ": " + v);
          }
        }
        if ((v = obj[p = "LN10"]) !== void 0) {
          if (v == Math.LN10) this[p] = new this(v);
          else throw Error(invalidArgument + p + ": " + v);
        }
        return this;
      }
      Decimal2 = clone(Decimal2);
      Decimal2["default"] = Decimal2.Decimal = Decimal2;
      ONE = new Decimal2(1);
      if (typeof define == "function" && define.amd) {
        define(function() {
          return Decimal2;
        });
      } else if (typeof module != "undefined" && module.exports) {
        module.exports = Decimal2;
      } else {
        if (!globalScope) {
          globalScope = typeof self != "undefined" && self && self.self == self ? self : Function("return this")();
        }
        globalScope.Decimal = Decimal2;
      }
    })(exports);
  }
});

// src/lib/calendarToday.ts
function calendarDateISO(date, timeZone) {
  if (!timeZone) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function localTodayISO() {
  return calendarDateISO(/* @__PURE__ */ new Date());
}

// src/types/index.ts
var ANCILLARY_UNIT_TYPES = /* @__PURE__ */ new Set([
  "parking",
  "storage"
]);
function isAncillaryUnitType(u) {
  return ANCILLARY_UNIT_TYPES.has(u);
}

// src/types/receivables.ts
function computeReceivableStatus(item, asOfDate = localTodayISO()) {
  if (item.status === "cancelled" || item.status === "disputed" || item.status === "written-off") {
    return item.status;
  }
  if (item.outstandingAmount <= 0) return "paid";
  if (item.allocatedAmount > 0 && item.outstandingAmount > 0) {
    return item.dueDate < asOfDate ? "overdue" : "partially-paid";
  }
  if (item.dueDate < asOfDate) return "overdue";
  return "open";
}
function isReceivableOutstanding(item) {
  return item.outstandingAmount > 0 && item.status !== "cancelled" && item.status !== "written-off";
}

// src/lib/leaseCycles.ts
function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return dt.toISOString().slice(0, 10);
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function computeCycles(lease) {
  const N = Math.max(1, Math.floor(lease.rentFormula || 1));
  if (!lease.startDate || !lease.endDate || lease.endDate < lease.startDate) return [];
  const cycles = [];
  let monthOffset = 0;
  let index = 1;
  while (addMonthsISO(lease.startDate, monthOffset) <= lease.endDate) {
    const cycleStart = addMonthsISO(lease.startDate, monthOffset);
    let span = 1;
    while (span < N && addMonthsISO(lease.startDate, monthOffset + span) <= lease.endDate) {
      span += 1;
    }
    const cycleEnd = addDaysISO(addMonthsISO(lease.startDate, monthOffset + span), -1);
    const clampedEnd = cycleEnd > lease.endDate ? lease.endDate : cycleEnd;
    const rentTotal = Math.round(lease.monthlyRent * span * 100) / 100;
    const chargesTotal = Math.round(lease.monthlyCharges * span * 100) / 100;
    cycles.push({
      index,
      months: span,
      startDate: cycleStart,
      endDate: clampedEnd,
      rentTotal,
      chargesTotal,
      total: Math.round((rentTotal + chargesTotal) * 100) / 100
    });
    monthOffset += span;
    index += 1;
  }
  return cycles;
}
function getRentFormulaSegmentStart(lease, asOfDate, amendments, changes) {
  const formulaAmendmentIds = new Set(changes.filter((change) => change.fieldName === "rentFormula").map((change) => change.amendmentId));
  return amendments.filter((amendment) => amendment.leaseId === lease.id && (amendment.status === "active" || amendment.status === "ended" || amendment.status === "terminated") && amendment.effectiveDate <= asOfDate && formulaAmendmentIds.has(amendment.id)).reduce((latest, amendment) => amendment.effectiveDate > latest ? amendment.effectiveDate : latest, lease.startDate);
}

// src/lib/leasePricing.ts
function getPricingMode(lease) {
  if (lease.pricingMode) return lease.pricingMode;
  return lease.chargesBillingMode === "flat-rate" ? "flat-charges" : "separated";
}
function isAllInclusive(lease) {
  return getPricingMode(lease) === "all-inclusive";
}

// src/lib/formatters.ts
function formatDate(dateStr, locale = "fr-FR") {
  if (!dateStr) return "\u2014";
  const isoDate = dateStr.slice(0, 10);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!isoMatch) return dateStr;
  const [, yyyy, mm, dd] = isoMatch;
  return `${dd}/${mm}/${yyyy}`;
}

// src/lib/decimal.ts
var import_decimal = __toESM(require_decimal(), 1);
var Decimal = import_decimal.default;

// src/lib/money.ts
function roundMoney(amount) {
  return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

// src/lib/leaseIndexation.ts
function addYearsISO(iso, years) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}
function fullYearsBetween(startISO, endISO) {
  if (!startISO || !endISO || endISO < startISO) return 0;
  let years = Number(endISO.slice(0, 4)) - Number(startISO.slice(0, 4));
  const anniversary = addYearsISO(startISO, years);
  if (anniversary > endISO) years -= 1;
  return Math.max(0, years);
}
function roundIndexedRent(amount, mode) {
  if (mode === "nearest-euro") return amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (mode === "none") return amount.toNumber();
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
function getLeaseIndexationBaseDate(lease) {
  return lease.indexationBaseDate || lease.startDate || null;
}
function computeLeaseIndexation(lease, asOfDate) {
  if (!lease.indexationEnabled) {
    return { enabled: false, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "disabled" };
  }
  const baseDate = getLeaseIndexationBaseDate(lease);
  if (!baseDate) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "missing-base-date" };
  }
  if (fullYearsBetween(baseDate, asOfDate) < 1) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "before-first-anniversary" };
  }
  const baseIndex = Number(lease.indexationBaseIndex);
  const currentIndex = Number(lease.indexationCurrentIndex);
  if (!Number.isFinite(baseIndex) || baseIndex <= 0 || !Number.isFinite(currentIndex) || currentIndex <= 0) {
    return { enabled: true, applicable: false, factor: 1, uncappedFactor: 1, appliedCapPercent: null, reason: "missing-index-values" };
  }
  const uncapped = new Decimal(currentIndex).div(baseIndex);
  const cap = lease.indexationCapPercent == null || lease.indexationCapPercent === void 0 ? null : Number(lease.indexationCapPercent);
  const capFactor = cap != null && Number.isFinite(cap) && cap >= 0 ? new Decimal(1).plus(new Decimal(cap).div(100)) : null;
  const cappedFactor = capFactor && uncapped.greaterThan(capFactor) ? capFactor : uncapped;
  return {
    enabled: true,
    applicable: true,
    factor: cappedFactor.toNumber(),
    uncappedFactor: uncapped.toNumber(),
    appliedCapPercent: capFactor && uncapped.greaterThan(capFactor) ? cap : null,
    reason: null
  };
}
function getIndexedMonthlyRent(lease, asOfDate) {
  const baseRent = Number(lease.monthlyRent) || 0;
  const computation = computeLeaseIndexation(lease, asOfDate);
  if (!computation.applicable) return baseRent;
  const amount = computation.appliedCapPercent != null ? new Decimal(baseRent).times(new Decimal(1).plus(new Decimal(computation.appliedCapPercent).div(100))) : new Decimal(baseRent).times(Number(lease.indexationCurrentIndex)).div(Number(lease.indexationBaseIndex));
  return roundIndexedRent(amount, lease.indexationRoundingMode);
}
function getIndexedRentTotal(lease, cycleStartDate, months) {
  return new Decimal(getIndexedMonthlyRent(lease, cycleStartDate)).times(months).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

// src/lib/leaseReceivables.ts
function cycleDueDate(cycleStart, dueDay) {
  const [y, m] = cycleStart.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(Math.floor(dueDay || 1), 1), lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function addMonthsISO2(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return dt.toISOString().slice(0, 10);
}
function addDaysISO2(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function getOpenEndedReceivableThroughDate(today, rentFormula, scheduleStartDate, leadDays = 0, dueDay) {
  const rawMonths = Number(rentFormula);
  const months = Number.isFinite(rawMonths) ? Math.max(1, Math.floor(rawMonths)) : 1;
  if (!scheduleStartDate) return addDaysISO2(addMonthsISO2(today, months), -1);
  const horizon = addDaysISO2(today, Math.max(0, leadDays));
  let offset = 0;
  while ((dueDay == null ? addMonthsISO2(scheduleStartDate, offset + months) : cycleDueDate(addMonthsISO2(scheduleStartDate, offset + months), dueDay)) <= horizon) {
    offset += months;
  }
  return addDaysISO2(addMonthsISO2(scheduleStartDate, offset + months), -1);
}
function getLeaseBillingSlotKey(r) {
  return [r.leaseId, r.itemType, r.periodMonth, r.dueDate].join(":");
}
function reconcileActivatedAmendmentReceivables(existingReceivables, regeneratedReceivables, leaseId, effectiveDate, protectedReceivableIds = /* @__PURE__ */ new Set()) {
  const removedReceivables = existingReceivables.filter(
    (ri) => ri.leaseId === leaseId && ri.origin === "lease-schedule" && ri.dueDate >= effectiveDate && (ri.status === "open" || ri.status === "overdue") && ri.allocatedAmount <= 0 && !protectedReceivableIds.has(ri.id)
  );
  const keptReceivables = existingReceivables.filter(
    (ri) => ri.leaseId !== leaseId || ri.origin !== "lease-schedule" || ri.dueDate < effectiveDate || ri.status !== "open" && ri.status !== "overdue" || ri.allocatedAmount > 0 || protectedReceivableIds.has(ri.id)
  );
  const keptSlots = new Set(keptReceivables.filter((item) => item.origin === "lease-schedule").map(getLeaseBillingSlotKey));
  const keptCycles = /* @__PURE__ */ new Map();
  const cycleKey = (item) => [item.leaseId, item.itemType, item.periodMonth].join(":");
  for (const item of keptReceivables) {
    if (item.leaseId !== leaseId || item.origin !== "lease-schedule") continue;
    const key = cycleKey(item);
    if (!keptCycles.has(key)) keptCycles.set(key, /* @__PURE__ */ new Set());
    keptCycles.get(key).add(item.cycleEndDate ?? null);
  }
  const freshReceivables = regeneratedReceivables.filter((ri) => {
    if (ri.leaseId !== leaseId || ri.dueDate < effectiveDate) return false;
    const slot = getLeaseBillingSlotKey(ri);
    if (keptSlots.has(slot)) return false;
    const key = cycleKey(ri);
    const ends = keptCycles.get(key);
    if (ends?.has(null) || ends?.has(ri.cycleEndDate ?? null) || ri.cycleEndDate == null && ends && ends.size > 0) return false;
    keptSlots.add(slot);
    if (!ends) keptCycles.set(key, /* @__PURE__ */ new Set([ri.cycleEndDate ?? null]));
    else ends.add(ri.cycleEndDate ?? null);
    return true;
  });
  return {
    nextReceivables: [...keptReceivables, ...freshReceivables],
    removedReceivables,
    freshReceivables
  };
}
function minDate(...dates) {
  const valid = dates.filter((d) => !!d);
  if (valid.length === 0) return null;
  return valid.sort()[0];
}
function assignmentForCycle(cycleStart, assignments, units) {
  const active = assignments?.filter(
    (a) => a.startDate <= cycleStart && (!a.endDate || a.endDate >= cycleStart)
  );
  if (!units) return void 0;
  const mainUnitIds = new Set(units.filter((unit) => !isAncillaryUnitType(unit.unitType)).map((unit) => unit.id));
  return active?.filter((a) => mainUnitIds.has(a.unitId)).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.unitId.localeCompare(b.unitId))[0];
}
function generateLeaseReceivables(lease, opts) {
  const { currencyCode, genId, leadDays } = opts;
  const today = opts.today ?? localTodayISO();
  const receivables = [];
  const unassignedCycleStarts = [];
  if (lease.lifecycleStage !== "signed" && lease.lifecycleStage !== "active") {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  if (!lease.id || !lease.primaryTenantId || !lease.propertyId || !lease.startDate || !lease.endDate && !opts.openEndedThroughDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  const effectiveEndDate = minDate(
    lease.endDate || opts.openEndedThroughDate,
    lease.moveOutActualDate,
    lease.moveOutScheduledDate,
    lease.intendedMoveOutDate
  ) ?? lease.endDate ?? opts.openEndedThroughDate;
  if (!effectiveEndDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  const scheduleStartDate = opts.scheduleStartDate && opts.scheduleStartDate > lease.startDate ? opts.scheduleStartDate : lease.startDate;
  if (effectiveEndDate < scheduleStartDate) {
    return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
  }
  const scheduleLease = { ...lease, startDate: scheduleStartDate, endDate: effectiveEndDate };
  const cycles = computeCycles(scheduleLease);
  const isAdvance = (lease.rentFormula || 1) > 1;
  const allInclusive = isAllInclusive(lease);
  const dueDay = lease.dueDayOfMonth || 1;
  const horizonDate = new Date(Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)) + Math.max(0, leadDays ?? 0)
  )).toISOString().slice(0, 10);
  for (const cycle of cycles) {
    const nominalDueDate = cycleDueDate(cycle.startDate, dueDay);
    const dueDate = opts.scheduleStartDate && opts.scheduleStartDate > lease.startDate && cycle.index === 1 && nominalDueDate < scheduleStartDate ? scheduleStartDate : nominalDueDate;
    if (cycle.index > 1 && dueDate > horizonDate) continue;
    const assignment = assignmentForCycle(cycle.startDate, opts.assignments, opts.units);
    const unitId = opts.assignments ? assignment?.unitId : lease.unitId;
    if (!unitId) {
      unassignedCycleStarts.push(cycle.startDate);
      continue;
    }
    const periodMonth = cycle.startDate.slice(0, 7);
    const cycleSuffix = isAdvance ? ` (cycle ${cycle.index}, ${cycle.months} mo)` : "";
    const cycleLease = opts.leaseForCycle?.(cycle) ?? lease;
    if (!cycleLease.primaryTenantId) {
      unassignedCycleStarts.push(cycle.startDate);
      continue;
    }
    const indexedRentTotal = getIndexedRentTotal(cycleLease, cycle.startDate, cycle.months);
    if (indexedRentTotal > 0) {
      const rentItem = {
        id: genId("ri"),
        leaseId: lease.id,
        tenantId: cycleLease.primaryTenantId,
        propertyId: lease.propertyId,
        unitId,
        itemType: "rent",
        label: allInclusive ? isAdvance ? `All-inclusive rent \u2014 ${cycle.months}-month advance${cycleSuffix}` : "Monthly all-inclusive rent" : isAdvance ? `Rent \u2014 ${cycle.months}-month advance${cycleSuffix}` : "Monthly Rent",
        periodMonth,
        dueDate,
        currencyCode,
        expectedAmount: indexedRentTotal,
        allocatedAmount: 0,
        outstandingAmount: indexedRentTotal,
        status: "open",
        priority: 10,
        origin: "lease-schedule",
        notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today,
        updatedAt: today
      };
      rentItem.status = computeReceivableStatus(rentItem, today.slice(0, 10));
      receivables.push(rentItem);
    }
    const chargesTotal = roundMoney(cycleLease.monthlyCharges * cycle.months);
    if (!allInclusive && chargesTotal > 0) {
      const chargesItem = {
        id: genId("ri"),
        leaseId: lease.id,
        tenantId: cycleLease.primaryTenantId,
        propertyId: lease.propertyId,
        unitId,
        itemType: "charges",
        label: isAdvance ? `Charges \u2014 ${cycle.months}-month advance${cycleSuffix}` : "Monthly Charges",
        periodMonth,
        dueDate,
        currencyCode,
        expectedAmount: chargesTotal,
        allocatedAmount: 0,
        outstandingAmount: chargesTotal,
        status: "open",
        priority: 20,
        origin: "lease-schedule",
        notes: "",
        cycleIndex: cycle.index,
        cycleEndDate: cycle.endDate,
        createdAt: today,
        updatedAt: today
      };
      chargesItem.status = computeReceivableStatus(chargesItem, today.slice(0, 10));
      receivables.push(chargesItem);
    }
  }
  return { receivables, unassignedCycleStarts, prepaymentReceipt: null, allocations: [] };
}

// src/lib/leaseAssignments.ts
var isAncillaryLeaseUnit = (unit) => !!unit && isAncillaryUnitType(unit.unitType);
var isMainLeaseUnit = (unit) => !!unit && !isAncillaryLeaseUnit(unit);
function assignmentIsActiveOn(a, isoDate) {
  if (a.startDate > isoDate) return false;
  if (a.endDate && a.endDate < isoDate) return false;
  return true;
}
function applyAssignmentShareChange(assignments, leaseId, unitId, effectiveDate, field, amount, updatedAt, newId) {
  const next = [];
  const priorDay = /* @__PURE__ */ new Date(`${effectiveDate}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const endBeforeEffective = priorDay.toISOString().slice(0, 10);
  for (const assignment of assignments) {
    if (assignment.leaseId !== leaseId || assignment.unitId !== unitId || !assignmentIsActiveOn(assignment, effectiveDate)) {
      next.push(assignment);
    } else if (assignment.startDate < effectiveDate) {
      next.push({ ...assignment, endDate: endBeforeEffective, updatedAt });
      next.push({ ...assignment, id: newId(), startDate: effectiveDate, [field]: amount, createdAt: updatedAt, updatedAt });
    } else {
      next.push({ ...assignment, [field]: amount, updatedAt });
    }
  }
  return next;
}

// src/lib/integrity/types.ts
function ok() {
  return { allowed: true, blockers: [], warnings: [], overrideAllowed: false };
}
function blocked(blockers, warnings = [], recommendedAction) {
  return { allowed: false, blockers, warnings, recommendedAction, overrideAllowed: false };
}
function allowedWithWarnings(warnings, overrideAllowed = false, recommendedAction) {
  return { allowed: true, blockers: [], warnings, recommendedAction, overrideAllowed };
}

// src/lib/integrity/leaseDateOverlap.ts
var IGNORED_STAGES = /* @__PURE__ */ new Set([
  "terminated",
  "ended"
]);
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (aEnd && aEnd < bStart) return false;
  if (bEnd && bEnd < aStart) return false;
  if (aEnd && aEnd === bStart) return false;
  if (bEnd && bEnd === aStart) return false;
  return true;
}
function findOverlappingLeases(leaseId, proposed, s) {
  const hits = [];
  for (const p of proposed) {
    if (!p.startDate) continue;
    for (const other of s.leaseUnitAssignments) {
      if (other.unitId !== p.unitId) continue;
      if (other.leaseId === leaseId) continue;
      const otherLease = s.leases.find((l) => l.id === other.leaseId);
      if (!otherLease) continue;
      if (IGNORED_STAGES.has(otherLease.lifecycleStage)) continue;
      const otherStart = [other.startDate, otherLease.startDate].filter(Boolean).sort().at(-1) ?? other.startDate;
      const otherEnd = [other.endDate, otherLease.endDate, otherLease.moveOutActualDate].filter((date) => !!date).sort()[0] ?? null;
      if (otherEnd && otherEnd <= otherStart) continue;
      if (!rangesOverlap(p.startDate, p.endDate, otherStart, otherEnd)) continue;
      hits.push({
        unitId: p.unitId,
        otherLeaseId: other.leaseId,
        otherStage: otherLease.lifecycleStage,
        proposedStart: p.startDate,
        proposedEnd: p.endDate,
        otherStart,
        otherEnd
      });
    }
  }
  return hits;
}
function formatOverlapRange(startDate, endDate) {
  return `${formatDate(startDate)} \u2013 ${endDate ? formatDate(endDate) : "open-ended"}`;
}
function formatOverlapConflictMessage(hit, labels) {
  const proposedRange = formatOverlapRange(hit.proposedStart, hit.proposedEnd);
  const occupiedRange = formatOverlapRange(hit.otherStart, hit.otherEnd);
  const availability = hit.otherEnd ? ` The unit is available from ${formatDate(hit.otherEnd)} onward.` : " The conflicting assignment has no end date, so the unit is unavailable until that assignment is closed.";
  return `Unit ${labels.unitLabel} is not available for ${proposedRange}: it overlaps lease ${labels.leaseRef} (${hit.otherStage}) during ${occupiedRange}.${availability}`;
}

// src/lib/businessTimeZone.ts
var DEFAULT_BUSINESS_TIME_ZONE = "Europe/Brussels";
var COUNTRY_TIME_ZONES = {
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  ES: "Europe/Madrid",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  IT: "Europe/Rome",
  LU: "Europe/Luxembourg",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  SE: "Europe/Stockholm"
};
var BUSINESS_TIME_ZONE_OPTIONS = [
  .../* @__PURE__ */ new Set([...Object.values(COUNTRY_TIME_ZONES), "Atlantic/Canary", "Atlantic/Azores"])
].sort((a, b) => a.localeCompare(b));
function defaultBusinessTimeZone(countryCode) {
  return COUNTRY_TIME_ZONES[countryCode.toUpperCase()] ?? DEFAULT_BUSINESS_TIME_ZONE;
}
function propertyBusinessDateISO(property, instant = /* @__PURE__ */ new Date()) {
  const timeZone = property?.timeZone || defaultBusinessTimeZone(property?.countryCode ?? "BE");
  return calendarDateISO(instant, timeZone);
}

// src/lib/dateValidation.ts
function isISOCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// src/lib/integrity/amendmentIntegrity.ts
function canActivateAmendment(amendmentId, s, businessDate) {
  const am = s.amendments.find((a) => a.id === amendmentId);
  if (!am) {
    return blocked([{ code: "AMD_NOT_FOUND", message: "Amendment not found" }]);
  }
  return validateAmendment(am, s.amendmentChanges.filter((c) => c.amendmentId === amendmentId), s, businessDate);
}
function validateAmendment(amendment, changes, s, businessDate) {
  const blockers = [];
  const warnings = [];
  const lease = s.leases.find((l) => l.id === amendment.leaseId);
  if (!lease) {
    blockers.push({ code: "AMD_LEASE_MISSING", message: "Lease no longer exists" });
    return blocked(blockers);
  }
  if (lease.lifecycleStage === "draft") {
    blockers.push({
      code: "AMD_LEASE_DRAFT",
      message: "Amendments only apply to signed leases; edit the draft directly instead"
    });
  }
  if (!amendment.effectiveDate) {
    blockers.push({ code: "AMD_NO_EFFECTIVE_DATE", message: "Effective date is required" });
  } else if (!isISOCalendarDate(amendment.effectiveDate)) {
    blockers.push({ code: "AMD_INVALID_EFFECTIVE_DATE", message: "Effective date must be a valid calendar date" });
    return blocked(blockers);
  }
  if (amendment.signedDate && !isISOCalendarDate(amendment.signedDate)) {
    blockers.push({ code: "AMD_INVALID_SIGNED_DATE", message: "Signed date must be a valid calendar date" });
  }
  const today = businessDate ?? propertyBusinessDateISO(
    s.properties?.find((candidate) => candidate.id === lease.propertyId)
  );
  if (amendment.effectiveDate && amendment.effectiveDate < today) {
    warnings.push({
      code: "AMD_EFFECTIVE_IN_PAST",
      message: "Effective date is in the past \u2014 past paid periods will not be rewritten",
      severity: "medium"
    });
  }
  if (amendment.effectiveDate && amendment.signedDate && amendment.signedDate > amendment.effectiveDate) {
    blockers.push({
      code: "AMD_SIGNED_AFTER_EFFECTIVE",
      message: "Signed date must be on or before the effective date"
    });
  }
  const eff = amendment.effectiveDate || today;
  const currentAssignments = s.leaseUnitAssignments.filter(
    (a) => a.leaseId === amendment.leaseId && assignmentIsActiveOn(a, eff)
  );
  let sim = currentAssignments.map((a) => ({
    unitId: a.unitId,
    rentShare: a.rentShare ?? 0,
    chargesShare: a.chargesShare ?? 0
  }));
  const validAmount = (value) => (typeof value === "number" || typeof value === "string" && value.trim().length > 0) && Number.isFinite(Number(value)) && Number(value) >= 0;
  for (const c of changes) {
    const targetsUnit = ["unitAssignments", "unitRentShare", "unitChargesShare", "unitEndDate"].includes(c.fieldName);
    const unitId = c.metadata?.unitId;
    if (targetsUnit && (!unitId || typeof unitId !== "string")) {
      blockers.push({ code: "AMD_UNIT_REFERENCE_MISSING", message: "Unit change is missing its unit reference" });
      continue;
    }
    if (targetsUnit && c.fieldName !== "unitAssignments" && !sim.some((unit) => unit.unitId === unitId)) {
      blockers.push({ code: "AMD_UNIT_NOT_ASSIGNED", message: "Unit to change is not assigned to this lease on the effective date" });
      continue;
    }
    if ((c.fieldName === "unitRentShare" || c.fieldName === "unitChargesShare") && !validAmount(c.newValue)) {
      blockers.push({ code: "AMD_INVALID_UNIT_AMOUNT", message: "Unit rent and charges must be non-negative amounts" });
      continue;
    }
    if (c.fieldName === "unitAssignments" && c.changeType === "add" && c.metadata?.unitId) {
      const amounts = c.newValue;
      if (!amounts || typeof amounts !== "object" || Array.isArray(amounts) || !validAmount(amounts.rentShare) || !validAmount(amounts.chargesShare)) {
        blockers.push({
          code: "AMD_INVALID_UNIT_AMOUNT",
          message: "Added unit needs finite, non-negative rent and charges amounts"
        });
        continue;
      }
      if (c.metadata.endDate && !isISOCalendarDate(c.metadata.endDate)) {
        blockers.push({
          code: "AMD_INVALID_UNIT_END_DATE",
          message: "Added unit end date must be a valid calendar date"
        });
        continue;
      }
      if (c.metadata.endDate && c.metadata.endDate < eff) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_EFFECTIVE",
          message: "Added unit end date must be on or after the amendment effective date"
        });
        continue;
      }
      const unit = s.units.find((u) => u.id === c.metadata.unitId);
      if (!unit) {
        blockers.push({ code: "AMD_UNIT_MISSING", message: "Unit to add no longer exists" });
        continue;
      }
      if (unit.propertyId !== lease.propertyId) {
        blockers.push({
          code: "AMD_UNIT_PROPERTY_MISMATCH",
          message: `Unit ${unit.unitCode} belongs to a different property`
        });
      }
      const addHits = findOverlappingLeases(lease.id, [{
        unitId: unit.id,
        startDate: eff,
        endDate: c.metadata.endDate || lease.endDate || null
      }], s);
      const seenAdd = /* @__PURE__ */ new Set();
      for (const hit of addHits) {
        const k = `${hit.unitId}|${hit.otherLeaseId}`;
        if (seenAdd.has(k)) continue;
        seenAdd.add(k);
        const otherLease = s.leases.find((l) => l.id === hit.otherLeaseId);
        const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
        blockers.push({
          code: "AMD_UNIT_OVERLAP",
          message: formatOverlapConflictMessage(hit, {
            unitLabel: unit.unitCode,
            leaseRef: ref
          })
        });
      }
      if (sim.find((x) => x.unitId === unit.id)) {
        blockers.push({
          code: "AMD_UNIT_DUPLICATE",
          message: `Unit ${unit.unitCode} is already on this lease`
        });
      } else {
        sim.push({
          unitId: unit.id,
          rentShare: Number(amounts.rentShare),
          chargesShare: Number(amounts.chargesShare)
        });
      }
    } else if (c.fieldName === "unitAssignments" && c.changeType === "remove" && c.metadata?.unitId) {
      if (!sim.some((unit) => unit.unitId === unitId)) {
        blockers.push({ code: "AMD_UNIT_NOT_ASSIGNED", message: "Unit to remove is not assigned to this lease on the effective date" });
        continue;
      }
      sim = sim.filter((x) => x.unitId !== c.metadata.unitId);
    } else if (c.fieldName === "unitAssignments") {
      blockers.push({ code: "AMD_UNIT_CHANGE_INVALID", message: "Unit assignment change must add or remove a unit" });
    } else if (c.fieldName === "unitRentShare" && c.metadata?.unitId) {
      sim = sim.map((x) => x.unitId === c.metadata.unitId ? { ...x, rentShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "unitChargesShare" && c.metadata?.unitId) {
      sim = sim.map((x) => x.unitId === c.metadata.unitId ? { ...x, chargesShare: Number(c.newValue) || 0 } : x);
    } else if (c.fieldName === "rentFormula") {
      const v = Number(c.newValue);
      if (!Number.isInteger(v) || v < 1) {
        blockers.push({ code: "AMD_INVALID_RENT_FORMULA", message: "Rent formula must be a period of at least 1 month" });
      }
    } else if (c.fieldName === "indexationSettings") {
      const v = c.newValue;
      if (!v || typeof v !== "object" || Array.isArray(v) || typeof v.indexationEnabled !== "boolean") {
        blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation settings are incomplete" });
      } else if (v.indexationEnabled) {
        if (v.indexationBaseIndex != null && (!validAmount(v.indexationBaseIndex) || Number(v.indexationBaseIndex) === 0)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation base index must be greater than 0" });
        }
        if (v.indexationCurrentIndex != null && (!validAmount(v.indexationCurrentIndex) || Number(v.indexationCurrentIndex) === 0)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation current index must be greater than 0" });
        }
        if (v.indexationCapPercent != null && !validAmount(v.indexationCapPercent)) {
          blockers.push({ code: "AMD_INVALID_INDEXATION", message: "Indexation cap cannot be negative" });
        }
      }
    } else if (c.fieldName === "baseMonthlyRentTotal") {
      if (!validAmount(c.newValue)) {
        blockers.push({ code: "AMD_INVALID_RENT", message: "Rent must be a non-negative amount" });
      }
    } else if (c.fieldName === "baseMonthlyChargesTotal") {
      if (!validAmount(c.newValue)) {
        blockers.push({ code: "AMD_INVALID_CHARGES", message: "Charges must be a non-negative amount" });
      }
    } else if (c.fieldName === "leaseEndDate") {
      const nv = String(c.newValue ?? "");
      if (nv && !isISOCalendarDate(nv)) {
        blockers.push({ code: "AMD_INVALID_LEASE_END_DATE", message: "Lease end date must be a valid calendar date" });
        continue;
      }
      if (nv && nv < lease.startDate) {
        blockers.push({
          code: "AMD_END_BEFORE_START",
          message: "End date cannot be before lease start date"
        });
      }
      if (nv && amendment.effectiveDate && nv < amendment.effectiveDate) {
        blockers.push({
          code: "AMD_END_BEFORE_EFFECTIVE",
          message: "New end date must be on or after the amendment effective date"
        });
      }
      if (nv) {
        const myAssignments = s.leaseUnitAssignments.filter(
          (a) => a.leaseId === lease.id && assignmentIsActiveOn(a, eff)
        );
        const probe = myAssignments.map((a) => ({
          unitId: a.unitId,
          startDate: a.startDate,
          endDate: nv
        }));
        const endHits = findOverlappingLeases(lease.id, probe, s);
        const seenEnd = /* @__PURE__ */ new Set();
        for (const hit of endHits) {
          const k = `${hit.unitId}|${hit.otherLeaseId}`;
          if (seenEnd.has(k)) continue;
          seenEnd.add(k);
          const unit = s.units.find((u) => u.id === hit.unitId);
          const otherLease = s.leases.find((l) => l.id === hit.otherLeaseId);
          const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
          blockers.push({
            code: "AMD_END_OVERLAP",
            message: formatOverlapConflictMessage(hit, {
              unitLabel: unit?.unitCode ?? hit.unitId,
              leaseRef: ref
            })
          });
        }
      }
    } else if (c.fieldName === "unitEndDate" && c.metadata?.unitId) {
      const nv = String(c.newValue ?? "");
      if (nv && !isISOCalendarDate(nv)) {
        blockers.push({ code: "AMD_INVALID_UNIT_END_DATE", message: "Unit end date must be a valid calendar date" });
        continue;
      }
      if (nv && nv < lease.startDate) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_START",
          message: "Unit end date cannot be before the lease start date"
        });
      }
      if (nv && amendment.effectiveDate && nv < amendment.effectiveDate) {
        blockers.push({
          code: "AMD_UNIT_END_BEFORE_EFFECTIVE",
          message: "Unit end date must be on or after the amendment effective date"
        });
      }
      if (nv) {
        const a = s.leaseUnitAssignments.find(
          (x) => x.leaseId === lease.id && x.unitId === c.metadata.unitId && assignmentIsActiveOn(x, eff)
        );
        if (a) {
          const endHits = findOverlappingLeases(lease.id, [{
            unitId: a.unitId,
            startDate: a.startDate,
            endDate: nv
          }], s);
          const seen = /* @__PURE__ */ new Set();
          for (const hit of endHits) {
            const k = `${hit.unitId}|${hit.otherLeaseId}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const unit = s.units.find((u) => u.id === hit.unitId);
            const otherLease = s.leases.find((l) => l.id === hit.otherLeaseId);
            const ref = otherLease?.leaseReference ?? hit.otherLeaseId.slice(0, 8);
            blockers.push({
              code: "AMD_UNIT_END_OVERLAP",
              message: formatOverlapConflictMessage(hit, {
                unitLabel: unit?.unitCode ?? hit.unitId,
                leaseRef: ref
              })
            });
          }
        }
      }
    }
  }
  if (lease.lifecycleStage === "active") {
    if (sim.length === 0) {
      blockers.push({
        code: "AMD_NO_UNITS_LEFT",
        message: "Active lease must retain at least one unit"
      });
    }
    const mainUnits = sim.filter((x) => {
      const unit = s.units.find((u) => u.id === x.unitId);
      return !!unit && !isAncillaryUnitType(unit.unitType);
    }).length;
    if (mainUnits === 0 && sim.length > 0) {
      blockers.push({
        code: "AMD_NO_PRIMARY_LEFT",
        message: "Active lease must retain at least one residential or main commercial unit"
      });
    }
  }
  const overlappingUnpaid = s.receivableItems.filter(
    (ri) => ri.leaseId === lease.id && isReceivableOutstanding(ri) && (ri.cycleEndDate ? ri.cycleEndDate >= eff : (ri.periodMonth ?? ri.dueDate.slice(0, 7)) >= eff.slice(0, 7))
  );
  if (overlappingUnpaid.length > 0) {
    warnings.push({
      code: "AMD_UNPAID_OVERLAP",
      message: `${overlappingUnpaid.length} unpaid receivable(s) overlap the effective date \u2014 review before activation`,
      severity: "high"
    });
  }
  if (changes.some((change) => change.fieldName === "rentFormula")) {
    const crossingCycles = s.receivableItems.filter(
      (ri) => ri.leaseId === lease.id && ri.origin === "lease-schedule" && (ri.itemType === "rent" || ri.itemType === "charges") && ri.dueDate < eff && !!ri.cycleEndDate && ri.cycleEndDate >= eff && ri.status !== "cancelled" && ri.status !== "written-off"
    );
    if (crossingCycles.length > 0) {
      blockers.push({
        code: "AMD_FORMULA_CROSSES_BILLED_CYCLE",
        message: `${crossingCycles.length} existing billed receivable(s) cover the new formula's effective date. Move the effective date after the billed cycle or reconcile those receivables before changing the formula`
      });
    }
  }
  const allocatedFuture = s.receivableItems.filter(
    (ri) => ri.leaseId === lease.id && ri.dueDate >= eff && ri.allocatedAmount > 0
  );
  if (allocatedFuture.length > 0) {
    warnings.push({
      code: "AMD_ALLOCATED_FUTURE_RECEIVABLES",
      message: `${allocatedFuture.length} future allocated receivable(s) will be preserved and must be reviewed manually`,
      severity: "high"
    });
  }
  const previousActive = s.amendments.find(
    (o) => o.id !== amendment.id && o.leaseId === lease.id && o.status === "active"
  );
  if (previousActive) {
    warnings.push({
      code: "AMD_WILL_END_PREVIOUS",
      message: `Activating this amendment will end Amendment #${previousActive.amendmentNumber} currently in force`,
      severity: "medium"
    });
  }
  if (blockers.length > 0) return blocked(blockers, warnings);
  if (warnings.length > 0) return allowedWithWarnings(warnings, false);
  return ok();
}

// src/lib/amendments.ts
function getLeaseAmendments(leaseId, amendments) {
  return amendments.filter((a) => a.leaseId === leaseId).slice().sort((x, y) => {
    if (x.effectiveDate !== y.effectiveDate) return x.effectiveDate.localeCompare(y.effectiveDate);
    return x.amendmentNumber - y.amendmentNumber;
  });
}
function getAmendmentChanges(amendmentId, changes) {
  return changes.filter((c) => c.amendmentId === amendmentId);
}
function originalUnitEndDates(lease, s, appliedChanges) {
  const initialUnitIds = new Set(s.leaseUnitAssignments.filter((a) => a.leaseId === lease.id && a.startDate <= lease.startDate).map((a) => a.unitId));
  const ends = /* @__PURE__ */ new Map();
  for (const unitId of initialUnitIds) {
    const firstChange = appliedChanges.find((c) => c.fieldName === "unitEndDate" && c.metadata?.unitId === unitId);
    if (firstChange?.oldValue !== void 0) {
      ends.set(unitId, String(firstChange.oldValue ?? ""));
      continue;
    }
    const rows = s.leaseUnitAssignments.filter((a) => a.leaseId === lease.id && a.unitId === unitId);
    ends.set(unitId, rows.some((a) => !a.endDate) ? "" : rows.reduce(
      (latest, a) => a.endDate && a.endDate > latest ? a.endDate : latest,
      ""
    ));
  }
  return ends;
}
function latestUnitEnd(ends) {
  const dates = [...ends];
  return dates.some((date) => !date) ? "" : dates.reduce(
    (latest, date) => date > latest ? date : latest,
    ""
  );
}
function getOriginalLeaseTerms(leaseId, s) {
  const lease = s.leases.find((l) => l.id === leaseId);
  if (!lease) return null;
  const originalAssignments = s.leaseUnitAssignments.filter(
    (a) => a.leaseId === leaseId && a.startDate <= lease.startDate
  );
  const appliedChanges = getLeaseAmendments(leaseId, s.amendments).filter((a) => a.status === "active" || a.status === "ended").flatMap((a) => getAmendmentChanges(a.id, s.amendmentChanges));
  const firstOldValue = (fieldName) => appliedChanges.find((c) => c.fieldName === fieldName)?.oldValue;
  const rentWasAmended = appliedChanges.some((c) => c.fieldName === "unitRentShare" || c.fieldName === "baseMonthlyRentTotal" || c.fieldName === "unitAssignments");
  const chargesWereAmended = appliedChanges.some((c) => c.fieldName === "unitChargesShare" || c.fieldName === "baseMonthlyChargesTotal" || c.fieldName === "unitAssignments");
  const firstRentChange = appliedChanges.find((c) => c.fieldName === "unitRentShare" || c.fieldName === "baseMonthlyRentTotal" || c.fieldName === "unitAssignments");
  const firstChargesChange = appliedChanges.find((c) => c.fieldName === "unitChargesShare" || c.fieldName === "baseMonthlyChargesTotal" || c.fieldName === "unitAssignments");
  const firstRentBase = appliedChanges.find((c) => c.amendmentId === firstRentChange?.amendmentId && c.fieldName === "baseMonthlyRentTotal");
  const firstChargesBase = appliedChanges.find((c) => c.amendmentId === firstChargesChange?.amendmentId && c.fieldName === "baseMonthlyChargesTotal");
  const originalBaseRent = firstRentBase?.oldValue == null ? NaN : Number(firstRentBase.oldValue);
  const originalBaseCharges = firstChargesBase?.oldValue == null ? NaN : Number(firstChargesBase.oldValue);
  const firstEndChange = appliedChanges.find(
    (c) => c.fieldName === "leaseEndDate" || c.fieldName === "unitEndDate" || c.fieldName === "unitAssignments"
  );
  const originalEnd = firstEndChange?.fieldName === "leaseEndDate" ? firstEndChange.oldValue : void 0;
  const recordedOriginalEnd = firstEndChange?.metadata?.originalLeaseEndDate;
  const originalEnds = firstEndChange?.fieldName === "unitEndDate" || firstEndChange?.fieldName === "unitAssignments" && firstEndChange.changeType === "add" ? originalUnitEndDates(lease, s, appliedChanges) : void 0;
  const inferredOriginalEnd = originalEnds?.size ? latestUnitEnd(originalEnds.values()) : void 0;
  const originalDeposit = firstOldValue("depositAmount");
  const originalNotice = firstOldValue("noticePeriodText");
  const originalFormula = firstOldValue("rentFormula");
  const originalPrimaryTenant = firstOldValue("primaryTenantId");
  const originalCoTenants = firstOldValue("coTenantIds");
  const originalTenantIds = firstOldValue("tenantIds");
  const originalBillingTenant = firstOldValue("billingTenantId");
  const originalIndexation = firstOldValue("indexationSettings");
  return {
    leaseId,
    asOfDate: lease.startDate,
    monthlyRent: Number.isFinite(originalBaseRent) ? originalBaseRent : rentWasAmended && originalAssignments.length > 0 ? originalAssignments.reduce((sum, assignment) => sum + (assignment.rentShare ?? 0), 0) : lease.monthlyRent,
    monthlyCharges: Number.isFinite(originalBaseCharges) ? originalBaseCharges : chargesWereAmended && originalAssignments.length > 0 ? originalAssignments.reduce((sum, assignment) => sum + (assignment.chargesShare ?? 0), 0) : lease.monthlyCharges,
    endDate: originalEnd !== void 0 ? String(originalEnd ?? "") : recordedOriginalEnd !== void 0 ? recordedOriginalEnd : inferredOriginalEnd !== void 0 ? inferredOriginalEnd : lease.endDate,
    depositAmount: originalDeposit === void 0 ? lease.depositOrGuaranteeAmount : originalDeposit == null ? null : Number(originalDeposit),
    noticePeriodText: originalNotice === void 0 ? lease.noticePeriodText : String(originalNotice ?? ""),
    rentFormula: originalFormula === void 0 ? lease.rentFormula || 1 : Math.max(1, Number(originalFormula) || 1),
    indexationEnabled: originalIndexation?.indexationEnabled ?? lease.indexationEnabled ?? false,
    indexationFrequency: originalIndexation?.indexationFrequency ?? lease.indexationFrequency ?? "yearly",
    indexationBaseDate: originalIndexation?.indexationBaseDate !== void 0 ? originalIndexation.indexationBaseDate : lease.indexationBaseDate ?? lease.startDate ?? null,
    indexationBaseIndex: originalIndexation?.indexationBaseIndex !== void 0 ? originalIndexation.indexationBaseIndex : lease.indexationBaseIndex ?? null,
    indexationCurrentIndex: originalIndexation?.indexationCurrentIndex !== void 0 ? originalIndexation.indexationCurrentIndex : lease.indexationCurrentIndex ?? null,
    indexationCapPercent: originalIndexation?.indexationCapPercent !== void 0 ? originalIndexation.indexationCapPercent : lease.indexationCapPercent ?? null,
    indexationRoundingMode: originalIndexation?.indexationRoundingMode ?? lease.indexationRoundingMode ?? "nearest-cent",
    indexationNotes: originalIndexation?.indexationNotes ?? lease.indexationNotes ?? "",
    tenantIds: Array.isArray(originalTenantIds) ? originalTenantIds : lease.tenantIds ?? [lease.primaryTenantId, ...lease.coTenantIds].filter(Boolean),
    billingTenantId: typeof originalBillingTenant === "string" ? originalBillingTenant : lease.billingTenantId ?? lease.primaryTenantId,
    primaryTenantId: typeof originalPrimaryTenant === "string" ? originalPrimaryTenant : lease.primaryTenantId,
    coTenantIds: Array.isArray(originalCoTenants) ? originalCoTenants : [...lease.coTenantIds],
    units: originalAssignments.slice().sort((x, y) => {
      const xu = s.units.find((u) => u.id === x.unitId);
      const yu = s.units.find((u) => u.id === y.unitId);
      return Number(isMainLeaseUnit(yu)) - Number(isMainLeaseUnit(xu));
    }).map((a) => ({
      unitId: a.unitId,
      rentShare: a.rentShare ?? 0,
      chargesShare: a.chargesShare ?? 0
    }))
  };
}
function getEffectiveLeaseTerms(leaseId, date, s) {
  const lease = s.leases.find((l) => l.id === leaseId);
  if (!lease) return null;
  const base = getOriginalLeaseTerms(leaseId, s);
  if (!base) return null;
  let terms = { ...base, asOfDate: date };
  const liveUnits = s.leaseUnitAssignments.filter((a) => a.leaseId === leaseId && assignmentIsActiveOn(a, date)).sort((x, y) => {
    const xu = s.units.find((u) => u.id === x.unitId);
    const yu = s.units.find((u) => u.id === y.unitId);
    return Number(isMainLeaseUnit(yu)) - Number(isMainLeaseUnit(xu));
  }).map((a) => ({
    unitId: a.unitId,
    rentShare: a.rentShare ?? 0,
    chargesShare: a.chargesShare ?? 0
  }));
  terms = { ...terms, units: liveUnits };
  let rentTotalSource = null;
  let chargesTotalSource = null;
  let lastEndChange = null;
  let hasStructuralUnitChange = false;
  const datedUnitEndChanges = [];
  for (const am of getLeaseAmendments(leaseId, s.amendments).filter(
    (a) => (a.status === "active" || a.status === "ended") && a.effectiveDate <= date
  )) {
    const changes = getAmendmentChanges(am.id, s.amendmentChanges);
    const explicitRent = changes.some((c) => c.fieldName === "baseMonthlyRentTotal");
    const explicitCharges = changes.some((c) => c.fieldName === "baseMonthlyChargesTotal");
    const structuralChange = changes.some((c) => c.fieldName === "unitAssignments" || c.fieldName === "unitEndDate");
    const rentShareChange = structuralChange || changes.some((c) => c.fieldName === "unitRentShare");
    const chargesShareChange = structuralChange || changes.some((c) => c.fieldName === "unitChargesShare");
    for (const c of changes) {
      if (c.fieldName === "unitEndDate" || c.fieldName === "unitAssignments") lastEndChange = "unit";
      if (c.fieldName === "unitAssignments") hasStructuralUnitChange = true;
      if (c.fieldName === "unitEndDate") datedUnitEndChanges.push(c);
      switch (c.fieldName) {
        case "baseMonthlyRentTotal":
          terms.monthlyRent = Number(c.newValue) || 0;
          break;
        case "baseMonthlyChargesTotal":
          terms.monthlyCharges = Number(c.newValue) || 0;
          break;
        case "leaseEndDate":
          terms.endDate = String(c.newValue ?? "");
          lastEndChange = "lease";
          break;
        case "unitEndDate":
          break;
        case "depositAmount":
          terms.depositAmount = c.newValue == null ? null : Number(c.newValue);
          break;
        case "noticePeriodText":
          terms.noticePeriodText = String(c.newValue ?? "");
          break;
        case "rentFormula":
          terms.rentFormula = Math.max(1, Number(c.newValue) || 1);
          break;
        case "indexationSettings": {
          const value = c.newValue ?? {};
          terms = {
            ...terms,
            indexationEnabled: value.indexationEnabled ?? terms.indexationEnabled ?? false,
            indexationFrequency: "yearly",
            indexationBaseDate: value.indexationBaseDate !== void 0 ? value.indexationBaseDate : terms.indexationBaseDate ?? null,
            indexationBaseIndex: value.indexationBaseIndex !== void 0 ? value.indexationBaseIndex == null ? null : Number(value.indexationBaseIndex) : terms.indexationBaseIndex ?? null,
            indexationCurrentIndex: value.indexationCurrentIndex !== void 0 ? value.indexationCurrentIndex == null ? null : Number(value.indexationCurrentIndex) : terms.indexationCurrentIndex ?? null,
            indexationCapPercent: value.indexationCapPercent !== void 0 ? value.indexationCapPercent == null ? null : Number(value.indexationCapPercent) : terms.indexationCapPercent ?? null,
            indexationRoundingMode: value.indexationRoundingMode ?? terms.indexationRoundingMode ?? "nearest-cent",
            indexationNotes: value.indexationNotes ?? ""
          };
          break;
        }
        case "primaryTenantId":
          terms.primaryTenantId = String(c.newValue);
          break;
        case "tenantIds":
          if (Array.isArray(c.newValue)) terms.tenantIds = c.newValue;
          break;
        case "billingTenantId":
          terms.billingTenantId = String(c.newValue);
          break;
        case "coTenantIds":
          if (c.changeType === "add" && c.metadata?.tenantId) {
            if (!terms.coTenantIds.includes(c.metadata.tenantId)) {
              terms.coTenantIds = [...terms.coTenantIds, c.metadata.tenantId];
            }
          } else if (c.changeType === "remove" && c.metadata?.tenantId) {
            terms.coTenantIds = terms.coTenantIds.filter((x) => x !== c.metadata.tenantId);
          } else if (Array.isArray(c.newValue)) {
            terms.coTenantIds = c.newValue;
          }
          break;
        default:
          break;
      }
    }
    if (explicitRent) rentTotalSource = "explicit";
    else if (rentShareChange) rentTotalSource = "shares";
    if (explicitCharges) chargesTotalSource = "explicit";
    else if (chargesShareChange) chargesTotalSource = "shares";
  }
  if (liveUnits.length > 0) {
    const sumRent = liveUnits.reduce((s2, u) => s2 + u.rentShare, 0);
    const sumCharges = liveUnits.reduce((s2, u) => s2 + u.chargesShare, 0);
    if (rentTotalSource === "shares" || rentTotalSource === null && sumRent > 0) terms.monthlyRent = sumRent;
    if (chargesTotalSource === "shares" || chargesTotalSource === null && sumCharges > 0) terms.monthlyCharges = sumCharges;
  }
  const datedAssignments = s.leaseUnitAssignments.filter((a) => a.leaseId === leaseId && a.startDate <= date && !!a.endDate);
  if (lastEndChange === "unit" && !hasStructuralUnitChange && datedUnitEndChanges.length > 0) {
    const allAppliedChanges = getLeaseAmendments(leaseId, s.amendments).filter((a) => a.status === "active" || a.status === "ended").flatMap((a) => getAmendmentChanges(a.id, s.amendmentChanges));
    const ends = originalUnitEndDates(lease, s, allAppliedChanges);
    for (const change of datedUnitEndChanges) {
      if (change.metadata?.unitId && ends.has(change.metadata.unitId)) {
        ends.set(change.metadata.unitId, String(change.newValue ?? ""));
      }
    }
    if (ends.size > 0) terms.endDate = latestUnitEnd(ends.values());
  } else if (lastEndChange === "unit" && datedAssignments.length > 0) {
    const max = datedAssignments.reduce((m, a) => a.endDate > m ? a.endDate : m, datedAssignments[0].endDate);
    terms.endDate = max;
  }
  return terms;
}

// src/lib/serverReceivableSchedule.ts
function fromDatabaseRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    value
  ]));
}
function generateServerScheduleResult(input) {
  const lease = fromDatabaseRow(input.lease);
  const assignments = input.assignments.map((row) => fromDatabaseRow(row));
  const units = input.units.map((row) => fromDatabaseRow(row));
  const amendments = input.amendments.map((row) => fromDatabaseRow(row));
  const changes = input.changes.map((row) => fromDatabaseRow(row));
  const tenantIds = Array.isArray(lease.tenantIds) ? lease.tenantIds : [];
  lease.primaryTenantId = lease.billingTenantId || tenantIds[0] || "";
  lease.coTenantIds = tenantIds.filter((id) => id !== lease.primaryTenantId);
  lease.unitId = assignments[0]?.unitId ?? "";
  lease.endDate = lease.endDate ?? "";
  if (!lease.primaryTenantId || assignments.length === 0) {
    return { receivables: [], unassignedCycleStarts: [], prepaymentReceipt: null, allocations: [] };
  }
  const validAmount = (value) => (typeof value === "number" || typeof value === "string" && value.trim().length > 0) && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (!Number.isInteger(lease.dueDayOfMonth) || lease.dueDayOfMonth < 1 || lease.dueDayOfMonth > 31 || !Number.isInteger(lease.rentFormula) || lease.rentFormula < 1 || !validAmount(input.lease.monthly_rent) || !validAmount(input.lease.monthly_charges) || !lease.startDate || lease.endDate && lease.endDate < lease.startDate) {
    throw new Error(`Lease ${lease.id} has invalid billing terms; check due day, formula, amounts, and dates.`);
  }
  const segmentStart = getRentFormulaSegmentStart(lease, input.businessDate, amendments, changes);
  const appliedAmendments = amendments.filter((amendment) => amendment.leaseId === lease.id && (amendment.status === "active" || amendment.status === "ended") && amendment.effectiveDate <= input.businessDate);
  const appliedIds = new Set(appliedAmendments.map((amendment) => amendment.id));
  const appliedChanges = changes.filter((change) => appliedIds.has(change.amendmentId));
  for (const change of appliedChanges) {
    if (change.fieldName === "baseMonthlyRentTotal" || change.fieldName === "baseMonthlyChargesTotal") {
      if (!validAmount(change.oldValue) || !validAmount(change.newValue)) {
        throw new Error(`Historical ${change.fieldName} terms are missing from an applied amendment.`);
      }
    }
    if (change.fieldName !== "indexationSettings") continue;
    const required = [
      "indexationEnabled",
      "indexationBaseDate",
      "indexationBaseIndex",
      "indexationCurrentIndex",
      "indexationCapPercent",
      "indexationRoundingMode"
    ];
    const validSnapshot = (value) => value && typeof value === "object" && !Array.isArray(value) && required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && typeof value.indexationEnabled === "boolean";
    if (!validSnapshot(change.oldValue) || !validSnapshot(change.newValue)) {
      throw new Error("Historical indexation terms are missing from an applied amendment.");
    }
  }
  const orderedChanges = getLeaseAmendments(lease.id, appliedAmendments).flatMap((amendment) => getAmendmentChanges(amendment.id, appliedChanges));
  const firstRentChange = orderedChanges.find((change) => ["unitAssignments", "unitRentShare", "baseMonthlyRentTotal"].includes(change.fieldName));
  const firstChargesChange = orderedChanges.find((change) => ["unitAssignments", "unitChargesShare", "baseMonthlyChargesTotal"].includes(change.fieldName));
  const hasRecordedBase = (amendmentId, fieldName) => orderedChanges.some((change) => change.amendmentId === amendmentId && change.fieldName === fieldName && validAmount(change.oldValue));
  if (firstRentChange && !hasRecordedBase(firstRentChange.amendmentId, "baseMonthlyRentTotal") && assignments.some((assignment) => !validAmount(assignment.rentShare))) {
    throw new Error(`Lease ${lease.id} has missing unit rent shares; historical rent cannot be reconstructed.`);
  }
  if (firstChargesChange && !hasRecordedBase(firstChargesChange.amendmentId, "baseMonthlyChargesTotal") && assignments.some((assignment) => !validAmount(assignment.chargesShare))) {
    throw new Error(`Lease ${lease.id} has missing unit charges shares; historical charges cannot be reconstructed.`);
  }
  const termState = {
    leases: [lease],
    units,
    leaseUnitAssignments: assignments,
    amendments: appliedAmendments,
    amendmentChanges: appliedChanges
  };
  return generateLeaseReceivables(lease, {
    currencyCode: input.currencyCode,
    genId: input.genId,
    today: input.businessDate,
    leadDays: input.leadDays,
    assignments,
    units,
    scheduleStartDate: segmentStart,
    leaseForCycle: (cycle) => {
      let cycleLease = lease;
      if (appliedAmendments.length > 0) {
        const terms = getEffectiveLeaseTerms(lease.id, cycle.startDate, termState);
        if (!terms) throw new Error(`Historical lease terms are missing for ${cycle.startDate}.`);
        cycleLease = {
          ...lease,
          monthlyRent: terms.monthlyRent,
          monthlyCharges: terms.monthlyCharges,
          primaryTenantId: terms.billingTenantId || terms.primaryTenantId,
          indexationEnabled: terms.indexationEnabled,
          indexationFrequency: terms.indexationFrequency,
          indexationBaseDate: terms.indexationBaseDate,
          indexationBaseIndex: terms.indexationBaseIndex,
          indexationCurrentIndex: terms.indexationCurrentIndex,
          indexationCapPercent: terms.indexationCapPercent,
          indexationRoundingMode: terms.indexationRoundingMode
        };
      }
      const indexation = computeLeaseIndexation(cycleLease, cycle.startDate);
      if (cycleLease.monthlyRent > 0 && (indexation.reason === "missing-index-values" || indexation.reason === "missing-base-date")) {
        throw new Error(`Indexation cannot be calculated for lease ${lease.id} on ${cycle.startDate}: ${indexation.reason}.`);
      }
      return cycleLease;
    },
    openEndedThroughDate: lease.endDate ? void 0 : getOpenEndedReceivableThroughDate(input.businessDate, lease.rentFormula, segmentStart, input.leadDays, lease.dueDayOfMonth)
  });
}
function toServerReceivableRow(item, portfolioId) {
  const row = { portfolio_id: portfolioId };
  for (const [key, value] of Object.entries(item)) {
    if (key === "createdAt" || key === "updatedAt" || value === void 0) continue;
    row[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return row;
}

// src/lib/serverReceivableJob.ts
var PAGE_SIZE = 50;
var INSERT_BATCH_SIZE = 500;
var isValidBusinessDate = isISOCalendarDate;
function nextPageCursor(rows, previous) {
  let cursor = previous;
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id || cursor !== null && row.id <= cursor) {
      throw new Error("Scheduled receivable pagination returned missing or out-of-order IDs.");
    }
    cursor = row.id;
  }
  if (cursor === null) throw new Error("Cannot advance an empty scheduled receivable page.");
  return cursor;
}
async function collectRowsById(listPage, pageSize = 500) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("A positive page size is required.");
  const rows = [];
  for (let cursor = null; ; ) {
    const page = await listPage(cursor, pageSize);
    if (page.length > pageSize) throw new Error("Scheduled receivable page exceeded its limit.");
    if (page.length > 0) cursor = nextPageCursor(page, cursor);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
async function runDueReceivableJob(store, businessDate, genId = () => crypto.randomUUID(), dateForProperty) {
  if (!isValidBusinessDate(businessDate)) throw new Error("A valid business date is required.");
  const result = {
    leasesExamined: 0,
    rowsGenerated: 0,
    rowsInserted: 0,
    incompleteLeaseIds: []
  };
  for (let portfolioCursor = null; ; ) {
    const portfolios = await store.listPortfolios(portfolioCursor, PAGE_SIZE);
    if (portfolios.length > PAGE_SIZE) throw new Error("Scheduled receivable portfolio page exceeded its limit.");
    if (portfolios.length > 0) portfolioCursor = nextPageCursor(portfolios, portfolioCursor);
    for (const portfolio of portfolios) {
      const portfolioId = String(portfolio.id);
      const leadDays = Number(portfolio.receivable_lead_days ?? 15);
      if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 120) {
        throw new Error(`Invalid receivable lead time for portfolio ${portfolioId}.`);
      }
      for (let leaseCursor = null; ; ) {
        const leases = await store.listLeases(portfolioId, leaseCursor, PAGE_SIZE);
        if (leases.length === 0) break;
        if (leases.length > PAGE_SIZE) throw new Error(`Scheduled receivable lease page exceeded its limit for ${portfolioId}.`);
        leaseCursor = nextPageCursor(leases, leaseCursor);
        result.leasesExamined += leases.length;
        const leaseIds = leases.map((row) => String(row.id));
        const propertyIds = [...new Set(leases.map((row) => String(row.property_id)))];
        const [properties, assignments, amendments] = await Promise.all([
          store.listProperties(propertyIds),
          store.listAssignments(leaseIds),
          store.listAmendments(leaseIds)
        ]);
        const unitIds = [...new Set(assignments.map((row) => String(row.unit_id)))];
        const units = unitIds.length > 0 ? await store.listUnits(unitIds) : [];
        const changes = amendments.length > 0 ? await store.listChanges(amendments.map((row) => String(row.id))) : [];
        const propertyById = new Map(properties.map((row) => [String(row.id), row]));
        const unitById = new Map(units.map((row) => [String(row.id), row]));
        const rows = [];
        for (const lease of leases) {
          const leaseId = String(lease.id);
          try {
            const property = propertyById.get(String(lease.property_id));
            const propertyDate = property && dateForProperty ? dateForProperty(property) : businessDate;
            if (!isValidBusinessDate(propertyDate)) {
              throw new Error(`Invalid business date for property ${String(lease.property_id)}.`);
            }
            const leaseAssignments = assignments.filter((row) => row.lease_id === leaseId);
            const tenantIds = Array.isArray(lease.tenant_ids) ? lease.tenant_ids : [];
            const coverageDate = String(lease.start_date) > propertyDate ? String(lease.start_date) : propertyDate;
            const hasCurrentMainAssignment = leaseAssignments.some((row) => {
              const unit = unitById.get(String(row.unit_id));
              return unit?.property_id === lease.property_id && unit?.portfolio_id === portfolioId && ["apartment", "studio", "office", "house", "commercial-unit"].includes(String(unit.unit_type)) && String(row.start_date) <= coverageDate && (!row.end_date || String(row.end_date) >= coverageDate);
            });
            if (!property || property.portfolio_id !== portfolioId || !hasCurrentMainAssignment || !(lease.billing_tenant_id || tenantIds[0])) {
              result.incompleteLeaseIds.push(leaseId);
              continue;
            }
            const leaseAmendments = amendments.filter((row) => row.lease_id === leaseId);
            const amendmentIds = new Set(leaseAmendments.map((row) => row.id));
            const generated = generateServerScheduleResult({
              lease,
              assignments: leaseAssignments,
              units,
              amendments: leaseAmendments,
              changes: changes.filter((row) => amendmentIds.has(row.amendment_id)),
              currencyCode: String(property.currency_code),
              leadDays,
              businessDate: propertyDate,
              genId
            });
            if (generated.unassignedCycleStarts.length > 0) {
              result.incompleteLeaseIds.push(leaseId);
              console.error(`Due receivable schedule for lease ${leaseId} has no main unit assignment for cycles: ${generated.unassignedCycleStarts.join(", ")}`);
              continue;
            }
            result.rowsGenerated += generated.receivables.length;
            rows.push(...generated.receivables.map((item) => toServerReceivableRow(item, portfolioId)));
          } catch (error) {
            result.incompleteLeaseIds.push(leaseId);
            console.error(`Due receivable schedule for lease ${leaseId} failed`, error);
          }
        }
        for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
          const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
          const inserted = await store.insert(portfolioId, batch);
          if (!Number.isInteger(inserted) || inserted < 0 || inserted > batch.length) {
            throw new Error(`Invalid receivable insertion count for portfolio ${portfolioId}.`);
          }
          result.rowsInserted += inserted;
        }
        if (leases.length < PAGE_SIZE) break;
      }
    }
    if (portfolios.length < PAGE_SIZE) break;
  }
  return result;
}

// src/lib/tenantStatus.ts
var APPLICANT_LEASE_STAGES = /* @__PURE__ */ new Set([
  "draft",
  "pending-signature",
  "signed"
]);
function deriveTenantStatusFromLeases(leases) {
  if (leases.length === 0) return null;
  if (leases.some((lease) => lease.lifecycleStage === "active")) return "active";
  if (leases.some((lease) => APPLICANT_LEASE_STAGES.has(lease.lifecycleStage))) return "applicant";
  return "former";
}

// src/lib/amendmentActivationPlan.ts
function planAmendmentActivation(id, state, options) {
  const { businessDate, timestamp: ts, genId, receivableLeadDays, pending } = options;
  const workingAmendments = pending ? [...state.amendments.filter((a) => a.id !== id), pending.amendment] : state.amendments;
  const workingChanges = pending ? [...state.amendmentChanges.filter((c) => c.amendmentId !== id), ...pending.changes] : state.amendmentChanges;
  const am = workingAmendments.find((a) => a.id === id);
  if (!am) return { ok: false, reason: "Amendment not found" };
  if (am.effectiveDate && am.effectiveDate > businessDate) {
    return { ok: false, reason: "Effective date is in the future \u2014 schedule instead" };
  }
  const validation = canActivateAmendment(
    id,
    { ...state, amendments: workingAmendments, amendmentChanges: workingChanges },
    businessDate
  );
  if (!validation.allowed) {
    return { ok: false, reason: validation.blockers.map((b) => b.message).join(". ") };
  }
  const eff = am.effectiveDate;
  const priorDay = /* @__PURE__ */ new Date(`${eff}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const dayBefore = priorDay.toISOString().slice(0, 10);
  const changes = getAmendmentChanges(id, workingChanges);
  const leaseAssignments = state.leaseUnitAssignments.filter((item) => item.leaseId === am.leaseId);
  const validAmount = (value) => (typeof value === "number" || typeof value === "string" && value.trim().length > 0) && Number.isFinite(Number(value)) && Number(value) >= 0;
  const validRecordedBase = (fieldName) => changes.some((change) => change.fieldName === fieldName && validAmount(change.oldValue) && validAmount(change.newValue));
  if (changes.some((change) => change.fieldName === "unitAssignments" || change.fieldName === "unitRentShare") && !validRecordedBase("baseMonthlyRentTotal") && leaseAssignments.some((item) => !validAmount(item.rentShare))) {
    return { ok: false, reason: "Unit rent shares are missing. Set them before changing unit pricing or record the previous and new total rent." };
  }
  if (changes.some((change) => change.fieldName === "unitAssignments" || change.fieldName === "unitChargesShare") && !validRecordedBase("baseMonthlyChargesTotal") && leaseAssignments.some((item) => !validAmount(item.chargesShare))) {
    return { ok: false, reason: "Unit charges shares are missing. Set them before changing unit pricing or record the previous and new total charges." };
  }
  const rentFormulaChange = changes.find((c) => c.fieldName === "rentFormula");
  const nextRentFormula = rentFormulaChange ? Math.max(1, Math.floor(Number(rentFormulaChange.newValue) || 1)) : null;
  let nextAssignments = [...state.leaseUnitAssignments];
  for (const change of changes) {
    if (change.fieldName === "unitAssignments" && change.changeType === "add" && change.metadata?.unitId) {
      const value = change.newValue ?? {};
      nextAssignments.push({
        id: genId("lua"),
        leaseId: am.leaseId,
        unitId: change.metadata.unitId,
        startDate: eff,
        endDate: change.metadata.endDate ?? null,
        rentShare: Number(value.rentShare ?? 0),
        chargesShare: Number(value.chargesShare ?? 0),
        notes: `Added by amendment ${am.amendmentNumber}`,
        createdAt: ts,
        updatedAt: ts
      });
    } else if (change.fieldName === "unitAssignments" && change.changeType === "remove" && change.metadata?.unitId) {
      nextAssignments = nextAssignments.map(
        (a) => a.leaseId === am.leaseId && a.unitId === change.metadata.unitId && assignmentIsActiveOn(a, eff) ? { ...a, endDate: dayBefore, updatedAt: ts } : a
      );
    } else if (change.fieldName === "unitEndDate" && change.metadata?.unitId) {
      const endDate = String(change.newValue ?? "");
      nextAssignments = nextAssignments.map(
        (a) => a.leaseId === am.leaseId && a.unitId === change.metadata.unitId && assignmentIsActiveOn(a, eff) ? { ...a, endDate: endDate || null, updatedAt: ts } : a
      );
    } else if (change.fieldName === "unitRentShare" && change.metadata?.unitId) {
      nextAssignments = applyAssignmentShareChange(
        nextAssignments,
        am.leaseId,
        change.metadata.unitId,
        eff,
        "rentShare",
        Number(change.newValue) || 0,
        ts,
        () => genId("lua")
      );
    } else if (change.fieldName === "unitChargesShare" && change.metadata?.unitId) {
      nextAssignments = applyAssignmentShareChange(
        nextAssignments,
        am.leaseId,
        change.metadata.unitId,
        eff,
        "chargesShare",
        Number(change.newValue) || 0,
        ts,
        () => genId("lua")
      );
    }
  }
  const previousActives = workingAmendments.filter((a) => a.leaseId === am.leaseId && a.id !== id && a.status === "active").slice().sort((x, y) => x.effectiveDate !== y.effectiveDate ? y.effectiveDate.localeCompare(x.effectiveDate) : y.amendmentNumber - x.amendmentNumber);
  const supersededId = previousActives[0]?.id ?? am.supersedesAmendmentId ?? null;
  const endedIds = new Set(previousActives.map((a) => a.id));
  const nextAmendments = workingAmendments.map((a) => {
    if (a.id === id) return { ...a, status: "active", supersedesAmendmentId: supersededId, updatedAt: ts };
    if (endedIds.has(a.id)) return { ...a, status: "ended", updatedAt: ts };
    return a;
  });
  const lease = state.leases.find((l) => l.id === am.leaseId);
  if (!lease) return { ok: false, reason: "Lease not found" };
  const terms = getEffectiveLeaseTerms(am.leaseId, businessDate, {
    leases: state.leases,
    units: state.units,
    leaseUnitAssignments: nextAssignments,
    amendments: nextAmendments,
    amendmentChanges: workingChanges
  });
  if (!terms) return { ok: false, reason: "Effective lease terms could not be calculated" };
  const activeEnds = nextAssignments.filter((a) => a.leaseId === am.leaseId && assignmentIsActiveOn(a, eff) && !!a.endDate).map((a) => a.endDate);
  const derivedEnd = activeEnds.length > 0 ? activeEnds.reduce((max, date) => date > max ? date : max, activeEnds[0]) : terms.endDate;
  const tenantIds = [...new Set((changes.some((change) => change.fieldName === "tenantIds") ? terms.tenantIds : [terms.primaryTenantId, ...terms.coTenantIds]).filter(Boolean))];
  const billingTenantId = tenantIds.includes(terms.billingTenantId) ? terms.billingTenantId : tenantIds[0] ?? "";
  const patched = {
    ...lease,
    tenantIds,
    billingTenantId,
    monthlyRent: terms.monthlyRent ?? lease.monthlyRent,
    monthlyCharges: terms.monthlyCharges ?? lease.monthlyCharges,
    endDate: derivedEnd,
    depositOrGuaranteeAmount: terms.depositAmount,
    noticePeriodText: terms.noticePeriodText,
    rentFormula: nextRentFormula ?? terms.rentFormula ?? lease.rentFormula,
    indexationEnabled: terms.indexationEnabled ?? lease.indexationEnabled ?? false,
    indexationFrequency: terms.indexationFrequency ?? lease.indexationFrequency ?? "yearly",
    indexationBaseDate: terms.indexationBaseDate ?? null,
    indexationBaseIndex: terms.indexationBaseIndex ?? null,
    indexationCurrentIndex: terms.indexationCurrentIndex ?? null,
    indexationCapPercent: terms.indexationCapPercent ?? null,
    indexationRoundingMode: terms.indexationRoundingMode ?? lease.indexationRoundingMode ?? "nearest-cent",
    indexationNotes: terms.indexationNotes ?? lease.indexationNotes ?? "",
    hasAdvancePayment: nextRentFormula ? false : lease.hasAdvancePayment,
    advancePaymentAmount: nextRentFormula ? null : lease.advancePaymentAmount,
    advancePaymentDate: nextRentFormula ? null : lease.advancePaymentDate,
    advanceAllocationMethod: nextRentFormula ? null : lease.advanceAllocationMethod,
    advanceAppliedTo: nextRentFormula ? null : lease.advanceAppliedTo,
    advanceAllocationStartDate: nextRentFormula ? null : lease.advanceAllocationStartDate,
    advanceAllocationDurationMonths: nextRentFormula ? null : lease.advanceAllocationDurationMonths,
    fixedMonthlyReductionAmount: nextRentFormula ? null : lease.fixedMonthlyReductionAmount,
    primaryTenantId: billingTenantId,
    coTenantIds: tenantIds.filter((tenantId) => tenantId !== billingTenantId),
    updatedAt: ts
  };
  const property = state.properties.find((p) => p.id === patched.propertyId);
  const regeneratedResult = generateLeaseReceivables(patched, {
    currencyCode: property?.currencyCode ?? "EUR",
    genId,
    today: ts,
    leadDays: receivableLeadDays,
    assignments: nextAssignments.filter((a) => a.leaseId === patched.id),
    units: state.units,
    scheduleStartDate: nextRentFormula ? eff : void 0,
    openEndedThroughDate: patched.endDate ? void 0 : getOpenEndedReceivableThroughDate(
      ts,
      patched.rentFormula,
      nextRentFormula ? eff : patched.startDate,
      receivableLeadDays,
      patched.dueDayOfMonth
    )
  });
  if (regeneratedResult.unassignedCycleStarts.length) {
    return {
      ok: false,
      reason: `No main unit is assigned for billing cycle ${regeneratedResult.unassignedCycleStarts[0]}. Check the amendment unit dates.`
    };
  }
  const regenerated = regeneratedResult.receivables;
  const { nextReceivables, removedReceivables, freshReceivables } = reconcileActivatedAmendmentReceivables(
    state.receivableItems,
    regenerated,
    patched.id,
    eff,
    new Set(state.allocations.map((allocation) => allocation.receivableItemId))
  );
  const oldAssignmentsById = new Map(state.leaseUnitAssignments.filter((a) => a.leaseId === am.leaseId).map((item) => [item.id, item]));
  const changedAssignments = nextAssignments.filter((item) => {
    if (item.leaseId !== am.leaseId) return false;
    const prior = oldAssignmentsById.get(item.id);
    return !prior || prior.startDate !== item.startDate || prior.endDate !== item.endDate || prior.rentShare !== item.rentShare || prior.chargesShare !== item.chargesShare || prior.notes !== item.notes;
  }).map((item) => ({ item, expectedUpdatedAt: oldAssignmentsById.get(item.id)?.updatedAt }));
  const oldAmendmentsById = new Map(workingAmendments.map((item) => [item.id, item]));
  const changedAmendments = nextAmendments.filter((item) => item.id === id || endedIds.has(item.id)).map((item) => ({ item, expectedUpdatedAt: oldAmendmentsById.get(item.id).updatedAt }));
  const affectedTenantIds = /* @__PURE__ */ new Set([
    lease.primaryTenantId,
    ...lease.coTenantIds,
    patched.primaryTenantId,
    ...patched.coTenantIds
  ]);
  const updatedLeases = state.leases.map((item) => item.id === patched.id ? patched : item);
  const nextTenants = state.tenants.map((tenant) => {
    if (!affectedTenantIds.has(tenant.id)) return tenant;
    const status = deriveTenantStatusFromLeases(updatedLeases.filter(
      (item) => item.primaryTenantId === tenant.id || item.coTenantIds.includes(tenant.id)
    ));
    return status && status !== tenant.status ? { ...tenant, status, updatedAt: ts } : tenant;
  });
  const changedTenants = nextTenants.map((item, index) => ({ item, expectedUpdatedAt: state.tenants[index].updatedAt, changed: item !== state.tenants[index] })).filter((item) => item.changed).map(({ item, expectedUpdatedAt }) => ({ item, expectedUpdatedAt }));
  return { ok: true, plan: {
    lease: patched,
    originalLeaseUpdatedAt: lease.updatedAt,
    assignments: nextAssignments,
    amendments: nextAmendments,
    receivables: nextReceivables,
    tenants: nextTenants,
    changedAssignments,
    changedAmendments,
    removedReceivables,
    freshReceivables,
    changedTenants
  } };
}

// src/lib/serverAmendmentActivation.ts
function fromRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    value
  ]));
}
function toRow(item, portfolioId, kind) {
  const row = { portfolio_id: portfolioId };
  for (const [key, value] of Object.entries(item)) {
    if (key === "createdAt" || key === "updatedAt" || value === void 0) continue;
    row[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  if (kind === "lease") {
    const lease = item;
    row.tenant_ids = lease.tenantIds ?? [lease.primaryTenantId, ...lease.coTenantIds].filter(Boolean);
    row.billing_tenant_id = lease.billingTenantId ?? lease.primaryTenantId;
    if (row.end_date === "") row.end_date = null;
    delete row.primary_tenant_id;
    delete row.co_tenant_ids;
    delete row.unit_id;
  }
  if (kind === "amendment") delete row.amendment_type;
  return row;
}
function planServerAmendmentActivation(id, rows, options) {
  const assignments = rows.assignments.map((row) => fromRow(row));
  const leases = rows.leases.map((row) => {
    const lease = fromRow(row);
    const tenantIds = Array.isArray(lease.tenantIds) ? lease.tenantIds : [];
    lease.primaryTenantId = lease.billingTenantId || tenantIds[0] || "";
    lease.coTenantIds = tenantIds.filter((tenantId) => tenantId !== lease.primaryTenantId);
    lease.unitId = assignments.find((item) => item.leaseId === lease.id)?.unitId ?? "";
    lease.endDate = lease.endDate ?? "";
    return lease;
  });
  const state = {
    properties: rows.properties.map((row) => fromRow(row)),
    units: rows.units.map((row) => fromRow(row)),
    tenants: rows.tenants.map((row) => fromRow(row)),
    leases,
    guarantees: [],
    leaseUnitAssignments: assignments,
    amendments: rows.amendments.map((row) => fromRow(row)),
    amendmentChanges: rows.changes.map((row) => fromRow(row)),
    receivableItems: rows.receivables.map((row) => fromRow(row)),
    cashReceipts: [],
    allocations: rows.allocations.map((row) => fromRow(row)),
    tickets: [],
    costCategories: [],
    costEntries: [],
    allocationRules: [],
    allocationRuleUnitShares: [],
    costAllocationResults: []
  };
  return planAmendmentActivation(id, state, {
    businessDate: options.businessDate,
    timestamp: options.businessDate,
    genId: options.genId,
    receivableLeadDays: options.receivableLeadDays
  });
}
function toAmendmentActivationRpcArgs(id, portfolioId, result) {
  if (result.ok === false) throw new Error(result.reason);
  const plan = result.plan;
  return {
    p_target_amendment_id: id,
    p_lease: toRow(plan.lease, portfolioId, "lease"),
    p_assignments: plan.changedAssignments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId),
      expected_updated_at: expectedUpdatedAt ?? null
    })),
    p_amendments: plan.changedAmendments.map(({ item, expectedUpdatedAt }) => ({
      ...toRow(item, portfolioId, "amendment"),
      expected_updated_at: expectedUpdatedAt
    })),
    p_removed_receivables: plan.removedReceivables.map((item) => ({ id: item.id, expected_updated_at: item.updatedAt })),
    p_new_receivables: plan.freshReceivables.map((item) => toRow(item, portfolioId)),
    p_tenants: plan.changedTenants.map(({ item, expectedUpdatedAt }) => ({
      id: item.id,
      status: item.status,
      expected_updated_at: expectedUpdatedAt
    })),
    p_expected_lease_updated_at: plan.originalLeaseUpdatedAt
  };
}
function isCompleteAmendmentActivationResponse(args, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const response = data;
  const expectedLease = args.p_lease;
  if (!response.lease || typeof response.lease !== "object" || response.lease.id !== expectedLease.id) return false;
  const checks = [
    ["assignments", "p_assignments"],
    ["amendments", "p_amendments"],
    ["receivables", "p_new_receivables"],
    ["removed_receivable_ids", "p_removed_receivables"],
    ["tenants", "p_tenants"]
  ];
  return checks.every(([responseKey, requestKey]) => {
    const returned = response[responseKey];
    const expected = args[requestKey];
    if (!Array.isArray(returned) || !Array.isArray(expected) || returned.length !== expected.length) return false;
    const ids = new Set(returned.map((item) => responseKey === "removed_receivable_ids" ? String(item) : String(item?.id)));
    return ids.size === expected.length && expected.every((item) => ids.has(String(item.id)));
  });
}

// src/lib/serverAmendmentJob.ts
async function runDueAmendmentJob(store, businessDate, genId = () => crypto.randomUUID()) {
  if (!isValidBusinessDate(businessDate)) throw new Error("A valid business date is required.");
  const due = await store.listDueAmendments(businessDate);
  due.sort((a, b) => {
    const dateOrder = String(a.effective_date).localeCompare(String(b.effective_date));
    if (dateOrder) return dateOrder;
    const numberOrder = Number(a.amendment_number) - Number(b.amendment_number);
    return numberOrder || String(a.id).localeCompare(String(b.id));
  });
  const result = {
    amendmentsExamined: 0,
    activatedAmendments: 0,
    incompleteAmendmentIds: []
  };
  const failedLeaseIds = /* @__PURE__ */ new Set();
  for (const amendment of due) {
    const id = String(amendment.id);
    const leaseId = String(amendment.lease_id);
    const portfolioId = String(amendment.portfolio_id);
    let amendmentDate = businessDate;
    try {
      amendmentDate = store.dateForAmendment ? await store.dateForAmendment(amendment) : businessDate;
      if (!isValidBusinessDate(amendmentDate)) throw new Error("Invalid property business date.");
    } catch (error) {
      result.incompleteAmendmentIds.push(id);
      failedLeaseIds.add(leaseId);
      console.error(`Scheduled amendment ${id} has no valid business date`, error);
      continue;
    }
    if (String(amendment.effective_date) > amendmentDate) continue;
    result.amendmentsExamined += 1;
    if (failedLeaseIds.has(leaseId)) {
      result.incompleteAmendmentIds.push(id);
      continue;
    }
    try {
      const [rows, receivableLeadDays] = await Promise.all([
        store.loadRows(amendment),
        store.getLeadDays(portfolioId)
      ]);
      if (!Number.isInteger(receivableLeadDays) || receivableLeadDays < 0 || receivableLeadDays > 120) {
        throw new Error(`Invalid receivable lead time for portfolio ${portfolioId}.`);
      }
      const plan = planServerAmendmentActivation(id, rows, {
        businessDate: amendmentDate,
        portfolioId,
        receivableLeadDays,
        genId
      });
      await store.activate(toAmendmentActivationRpcArgs(id, portfolioId, plan));
      result.activatedAmendments += 1;
    } catch (error) {
      result.incompleteAmendmentIds.push(id);
      failedLeaseIds.add(leaseId);
      console.error(`Scheduled amendment ${id} failed`, error);
    }
  }
  return result;
}

// src/lib/scheduledBusinessInstant.ts
var MAX_DISPATCH_SKEW_MS = 15 * 60 * 1e3;
function parseScheduledBusinessInstant(value, now = /* @__PURE__ */ new Date()) {
  if (typeof value !== "string") throw new Error("UTC businessInstant required");
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) throw new Error("UTC businessInstant required");
  const instant = new Date(value);
  const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== canonical) {
    throw new Error("Invalid businessInstant");
  }
  if (Math.abs(now.getTime() - instant.getTime()) > MAX_DISPATCH_SKEW_MS) {
    throw new Error("businessInstant must be within 15 minutes of server time");
  }
  return instant;
}

// src/lib/scheduledJobAuth.ts
function equalSecret(actual, expected) {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}
function hasScheduledJobSecret(request, expected) {
  return isConfiguredScheduledJobSecret(expected) && equalSecret(request.headers.get("X-Cron-Secret") ?? "", expected);
}
function isConfiguredScheduledJobSecret(secret) {
  return typeof secret === "string" && secret.length >= 32;
}

// src/lib/serverDocumentCleanup.ts
function isScopedDocumentFilePath(item) {
  const prefix = `${item.portfolio_id}/${item.lease_id}/${item.document_id}/`;
  if (!item.storage_path.startsWith(prefix)) return false;
  const filename = item.storage_path.slice(prefix.length);
  if (filename === "" || filename === "." || filename === ".." || /[/%\\]/.test(filename)) return false;
  for (let index = 0; index < filename.length; index += 1) {
    const code = filename.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}
async function removeStorageFileIfPresent(storage, path) {
  const { data: exists, error: existsError } = await storage.exists(path);
  if (existsError && existsError.status !== 404) throw new Error(existsError.message);
  if (!exists) return;
  const { error } = await storage.remove([path]);
  if (error) throw new Error(error.message);
  const { data: stillExists, error: verifyError } = await storage.exists(path);
  if (verifyError && verifyError.status !== 404) throw new Error(verifyError.message);
  if (stillExists) throw new Error("Storage did not confirm file deletion");
}
async function runDocumentFileCleanup(pending, operations) {
  let removed = 0;
  const failedIds = [];
  for (const item of pending) {
    try {
      if (!isScopedDocumentFilePath(item)) {
        throw new Error("Queued file path is outside its document scope");
      }
      await operations.removeFile(item.storage_path);
      await operations.acknowledge(item.id);
      removed += 1;
    } catch (error) {
      failedIds.push(item.id);
      await operations.recordFailure(item, error instanceof Error ? error.message : String(error));
    }
  }
  return { scanned: pending.length, removed, failedIds, remaining: await operations.countRemaining() };
}
export {
  DEFAULT_BUSINESS_TIME_ZONE,
  calendarDateISO,
  collectRowsById,
  hasScheduledJobSecret,
  isCompleteAmendmentActivationResponse,
  isConfiguredScheduledJobSecret,
  isValidBusinessDate,
  parseScheduledBusinessInstant,
  removeStorageFileIfPresent,
  runDocumentFileCleanup,
  runDueAmendmentJob,
  runDueReceivableJob
};
/*! Bundled license information:

decimal.js-light/decimal.js:
  (*! decimal.js-light v2.5.1 https://github.com/MikeMcl/decimal.js-light/LICENCE *)
*/
