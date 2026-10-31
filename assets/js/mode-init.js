// Inlined into <head> so a light-mode visitor never sees a dark flash.
import { apply, read } from "./mode.js";

apply(read());
