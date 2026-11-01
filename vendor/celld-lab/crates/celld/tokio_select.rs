// Copyright 2026 Deno Land Inc. Apache-2.0 license.
//
// This file is substantially adapted from Tokio 1.53.1
// tokio/src/macros/select.rs, which carries this license:
//
// MIT License
//
// Copyright (c) Tokio Contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Every `tokio::` item re-exported below is `doc(hidden)` upstream, so none of
// them carries a compatibility guarantee. Tokio can rename, reshape, or delete
// any of them in a patch release without breaking its own semver promise, and
// the `tokio = "1"` caret range in ../../Cargo.toml does not prevent that. A
// Tokio version bump must therefore re-check this facade against the select.rs
// of the new version.
//
// The failure mode is a compile error in celld, not a behavior change, so
// nothing broken ships and no test passes wrongly. Without this note the person
// who runs `cargo update` sees a macro that no longer resolves and gets no
// pointer to the cause.
//
// Rejected: narrowing the `tokio` constraint to the range this facade is known
// to work with. That blocks unrelated Tokio fixes for the whole dependency tree
// to guard against a break the compiler already makes un-missable. Do not
// "fix" this by pinning.
#[doc(hidden)]
pub mod __asyncrt_select_support {
    pub use std::future::{poll_fn, Future, IntoFuture};
    pub use std::pin::Pin;
    pub use std::task::{ready, Poll};
    pub use tokio::macros::support::poll_budget_available;
    pub use tokio::{
        count, count_field, select_priv_clean_pattern, select_priv_declare_output_enum,
        select_variant,
    };
}

#[macro_export]
macro_rules! __celld_domain_select {
    (@reason $reason:literal) => {{
        const _: () = {
            let reason: &str = $reason;
            assert!(
                !reason.is_empty(),
                "select_biased! requires a non-empty reason string"
            );
        };
    }};
    (@start fair $branches:expr) => {
        $crate::asyncrt::select_start($branches)
    };
    (@start (biased $reason:literal) $_branches:expr) => {{
        $crate::__celld_domain_select!(@reason $reason);
        0_u32
    }};
    (@ {
        mode=$mode:tt;
        ( $($count:tt)* )
        $( ( $($skip:tt)* ) $bind:pat = $future:expr, if $condition:expr => $handler:expr, )+
        ; $else:expr
    }) => {{
        #[doc(hidden)]
        mod __celld_select_util {
            $crate::__asyncrt_select_support::select_priv_declare_output_enum!(
                ( $($count)* )
            );
        }

        const BRANCHES: u32 = $crate::__asyncrt_select_support::count!($($count)*);
        let mut disabled: __celld_select_util::Mask = Default::default();

        $(
            if !$condition {
                let mask: __celld_select_util::Mask =
                    1 << $crate::__asyncrt_select_support::count!($($skip)*);
                disabled |= mask;
            }
        )*

        #[allow(unused_mut)]
        let mut output = {
            let futures_init = ($($future,)+);
            let mut futures = ($(
                $crate::__asyncrt_select_support::IntoFuture::into_future(
                    $crate::__asyncrt_select_support::count_field!(
                        futures_init.$($skip)*
                    )
                ),
            )+);
            #[allow(unused_mut)]
            let mut futures = &mut futures;

            $crate::__asyncrt_select_support::poll_fn(|context| {
                $crate::__asyncrt_select_support::ready!(
                    $crate::__asyncrt_select_support::poll_budget_available(context)
                );

                let mut is_pending = false;
                let start = $crate::__celld_domain_select!(@start $mode BRANCHES);

                for offset in 0..BRANCHES {
                    let branch;
                    #[allow(clippy::modulo_one)]
                    {
                        branch = (start + offset) % BRANCHES;
                    }
                    match branch {
                        $(
                            #[allow(unreachable_code)]
                            $crate::__asyncrt_select_support::count!($($skip)*) => {
                                let mask = 1 << branch;
                                if disabled & mask == mask {
                                    continue;
                                }

                                let ($($skip,)* future, ..) = &mut *futures;
                                // SAFETY: The tuple stays on the stack and no future moves.
                                let future = unsafe {
                                    $crate::__asyncrt_select_support::Pin::new_unchecked(future)
                                };
                                let value = match $crate::__asyncrt_select_support::Future::poll(
                                    future,
                                    context,
                                ) {
                                    $crate::__asyncrt_select_support::Poll::Ready(value) => value,
                                    $crate::__asyncrt_select_support::Poll::Pending => {
                                        is_pending = true;
                                        continue;
                                    }
                                };

                                disabled |= mask;
                                #[allow(unreachable_patterns, unused_variables, unused_mut)]
                                match &value {
                                    $crate::__asyncrt_select_support::select_priv_clean_pattern!(
                                        $bind
                                    ) => {}
                                    _ => continue,
                                }

                                return $crate::__asyncrt_select_support::Poll::Ready(
                                    $crate::__asyncrt_select_support::select_variant!(
                                        __celld_select_util::Out,
                                        ($($skip)*)
                                    )(value),
                                );
                            }
                        )*
                        _ => unreachable!("the select branch index is out of range"),
                    }
                }

                if is_pending {
                    $crate::__asyncrt_select_support::Poll::Pending
                } else {
                    $crate::__asyncrt_select_support::Poll::Ready(
                        __celld_select_util::Out::Disabled,
                    )
                }
            })
            .await
        };

        #[allow(unreachable_patterns)]
        match output {
            $(
                $crate::__asyncrt_select_support::select_variant!(
                    __celld_select_util::Out,
                    ($($skip)*) ($bind)
                ) => $handler,
            )*
            __celld_select_util::Out::Disabled => $else,
            _ => unreachable!("the select output does not match a branch"),
        }
    }};

    (@ { mode=$mode:tt; $($tokens:tt)* }) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            $($tokens)*;
            panic!("all branches are disabled and there is no else branch")
        })
    };
    (@ { mode=$mode:tt; $($tokens:tt)* } else => $else:expr $(,)?) => {
        $crate::__celld_domain_select!(@ { mode=$mode; $($tokens)*; $else })
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr, if $condition:expr => $handler:block, $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if $condition => $handler,
        } $($rest)*)
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr => $handler:block, $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if true => $handler,
        } $($rest)*)
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr, if $condition:expr => $handler:block $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if $condition => $handler,
        } $($rest)*)
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr => $handler:block $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if true => $handler,
        } $($rest)*)
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr, if $condition:expr => $handler:expr) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if $condition => $handler,
        })
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr => $handler:expr) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if true => $handler,
        })
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr, if $condition:expr => $handler:expr, $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if $condition => $handler,
        } $($rest)*)
    };
    (@ { mode=$mode:tt; ($($skip:tt)*) $($tokens:tt)* }
        $pattern:pat = $future:expr => $handler:expr, $($rest:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=$mode;
            ($($skip)* _)
            $($tokens)*
            ($($skip)*) $pattern = $future, if true => $handler,
        } $($rest)*)
    };

    (biased; $($tokens:tt)*) => {
        compile_error!(
            "select! is fair and does not accept `biased;`; use select_biased! with a reason"
        )
    };
    (else => $else:expr $(,)?) => {{ $else }};
    ($pattern:pat = $($tokens:tt)*) => {
        $crate::__celld_domain_select!(@ {
            mode=fair;
            ()
        } $pattern = $($tokens)*)
    };
    () => {
        compile_error!("select! requires at least one branch")
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __celld_domain_select_biased {
    ($reason:literal; else => $else:expr $(,)?) => {{
        $crate::__celld_domain_select!(@reason $reason);
        $else
    }};
    ($reason:literal; $pattern:pat = $($tokens:tt)*) => {{
        $crate::__celld_domain_select!(@ {
            mode=(biased $reason);
            ()
        } $pattern = $($tokens)*)
    }};
    ($($tokens:tt)*) => {
        compile_error!("select_biased! requires a non-empty reason string as its first token")
    };
}
