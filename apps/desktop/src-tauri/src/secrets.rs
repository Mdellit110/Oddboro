//! The office's secrets in the Mac's Keychain, kept by the shell itself.
//!
//! The office (Node) asks with a line on its stdout,
//! `oddboro:secret {"id":1,"op":"set","account":"github:token","value":"..."}`,
//! and the shell answers with one JSON line on Node's stdin: `{"id":1,"ok":true}`,
//! or `{"id":1,"ok":false,"error":"..."}`. `list` answers every secret under
//! the app's service as `"secrets":{"<account>":"<value>"}`; `legacy` answers
//! the account names, never the values, under the old service the office used
//! through the `security` command, as `"accounts":[...]`. A secret line never
//! reaches the log, whole, garbled or unreadable (`private`).
//!
//! Why the shell: an item the `security` command makes trusts `security`, so
//! any program could read it back without a prompt. An item this app makes
//! trusts only this app, so any other program gets macOS's "allow access"
//! prompt. Linux and Windows keep their stores in the office as before.

use serde_json::{json, Map, Value};

/// The start of a request line on Node's stdout.
pub const PREFIX: &str = "oddboro:secret ";
/// The app's own service. New, so the old items and the new never mix.
pub const SERVICE: &str = "com.oddboro.office";
/// The service the office used through `security`, before the shell kept secrets.
pub const LEGACY_SERVICE: &str = "oddboro";

/// True for a line that may hold a secret: a request, or anything with the
/// request's mark in it, such as a request cut short or run into another line.
/// None of these ever goes to the log.
pub fn private(line: &str) -> bool {
    line.contains(PREFIX.trim_end())
}

/// What a store of secrets does. The Mac's Keychain in the app, a fake in tests.
pub trait Keychain {
    /// Every account and value under `service`.
    fn list(&self, service: &str) -> Result<Vec<(String, String)>, String>;
    /// Every account under `service`, read from the items' attributes alone,
    /// which macOS gives without asking.
    fn accounts(&self, service: &str) -> Result<Vec<String>, String>;
    /// Saves a value, replacing any there.
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String>;
    /// Removes a value. Removing one that is not there is no error.
    fn remove(&self, service: &str, account: &str) -> Result<(), String>;
}

#[derive(Debug, PartialEq)]
pub enum Op {
    List,
    Legacy,
    Set { account: String, value: String },
    Remove { account: String },
}

/// Reads a request line. A line with an id but nothing else usable gets an
/// error back under that id; one without an id gets nothing, since nothing
/// waits on it.
pub fn parse(line: &str) -> Result<(u64, Op), (Option<u64>, &'static str)> {
    let body = line.strip_prefix(PREFIX).ok_or((None, "not a request"))?;
    let request: Value = serde_json::from_str(body).map_err(|_| (None, "not JSON"))?;
    let id = request["id"].as_u64().ok_or((None, "no id"))?;
    let text = |key: &str| request[key].as_str().map(str::to_string);
    let account = || {
        text("account")
            .filter(|a| !a.is_empty())
            .ok_or((Some(id), "no account"))
    };
    let op = match request["op"].as_str() {
        Some("list") => Op::List,
        Some("legacy") => Op::Legacy,
        Some("set") => Op::Set {
            account: account()?,
            value: text("value").ok_or((Some(id), "no value"))?,
        },
        Some("remove") => Op::Remove {
            account: account()?,
        },
        _ => return Err((Some(id), "unknown op")),
    };
    Ok((id, op))
}

/// Does what a request line asks and returns the answer line, without its
/// line break. None when no answer can be sent.
pub fn answer(line: &str, keychain: &impl Keychain) -> Option<String> {
    let (id, op) = match parse(line) {
        Ok(request) => request,
        Err((id, error)) => return id.map(|id| fail(id, error)),
    };
    let done = match op {
        Op::List => keychain.list(SERVICE).map(|all| {
            let secrets: Map<String, Value> = all
                .into_iter()
                .map(|(a, v)| (a, Value::String(v)))
                .collect();
            json!({ "secrets": secrets })
        }),
        Op::Legacy => keychain
            .accounts(LEGACY_SERVICE)
            .map(|accounts| json!({ "accounts": accounts })),
        Op::Set { account, value } => keychain.set(SERVICE, &account, &value).map(|()| json!({})),
        Op::Remove { account } => keychain.remove(SERVICE, &account).map(|()| json!({})),
    };
    Some(match done {
        Ok(mut reply) => {
            reply["id"] = id.into();
            reply["ok"] = true.into();
            reply.to_string()
        }
        Err(error) => fail(id, &error),
    })
}

fn fail(id: u64, error: &str) -> String {
    json!({ "id": id, "ok": false, "error": error }).to_string()
}

/// The login keychain, through Apple's Security framework. This is the
/// file-based keychain, not the data-protection one, which needs entitlements
/// a Developer ID app cannot have.
///
/// A new item's access list trusts only the app that made it. macOS records
/// the app by its designated requirement (the Developer ID team and the bundle
/// id), not by the file's exact hash, so every signed update keeps access
/// with no prompt. A build signed by anyone else, or not at all, is another
/// app to macOS and gets the prompt.
#[cfg(target_os = "macos")]
pub struct Login;

#[cfg(target_os = "macos")]
impl Keychain for Login {
    fn list(&self, service: &str) -> Result<Vec<(String, String)>, String> {
        use security_framework::passwords::get_generic_password;
        self.accounts(service)?
            .into_iter()
            .map(|account| {
                let value = get_generic_password(service, &account).map_err(|e| e.to_string())?;
                Ok((account, String::from_utf8_lossy(&value).into_owned()))
            })
            .collect()
    }

    fn accounts(&self, service: &str) -> Result<Vec<String>, String> {
        use security_framework::item::{ItemClass, ItemSearchOptions, Limit};
        let found = ItemSearchOptions::new()
            .class(ItemClass::generic_password())
            .service(service)
            .load_attributes(true)
            .limit(Limit::All)
            .search();
        match found {
            Ok(items) => Ok(items
                .iter()
                .filter_map(|item| item.simplify_dict()?.remove("acct"))
                .collect()),
            Err(e) if e.code() == ITEM_NOT_FOUND => Ok(Vec::new()),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(service, account, value.as_bytes())
            .map_err(|e| e.to_string())
    }

    fn remove(&self, service: &str, account: &str) -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(service, account) {
            Err(e) if e.code() != ITEM_NOT_FOUND => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

/// `errSecItemNotFound`.
#[cfg(target_os = "macos")]
const ITEM_NOT_FOUND: i32 = -25300;

/// Linux and Windows keep their secrets in the office, so the shell offers
/// none there and says so to any request.
#[cfg(not(target_os = "macos"))]
pub struct Login;

#[cfg(not(target_os = "macos"))]
impl Keychain for Login {
    fn list(&self, _: &str) -> Result<Vec<(String, String)>, String> {
        Err(NOT_HERE.into())
    }
    fn accounts(&self, _: &str) -> Result<Vec<String>, String> {
        Err(NOT_HERE.into())
    }
    fn set(&self, _: &str, _: &str, _: &str) -> Result<(), String> {
        Err(NOT_HERE.into())
    }
    fn remove(&self, _: &str, _: &str) -> Result<(), String> {
        Err(NOT_HERE.into())
    }
}

#[cfg(not(target_os = "macos"))]
const NOT_HERE: &str = "the app keeps no secrets on this system";

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    /// A keychain in memory: (service, account) to value.
    #[derive(Default)]
    struct Fake(RefCell<BTreeMap<(String, String), String>>);

    impl Keychain for Fake {
        fn list(&self, service: &str) -> Result<Vec<(String, String)>, String> {
            Ok(self
                .0
                .borrow()
                .iter()
                .filter(|((s, _), _)| s == service)
                .map(|((_, a), v)| (a.clone(), v.clone()))
                .collect())
        }
        fn accounts(&self, service: &str) -> Result<Vec<String>, String> {
            Ok(self.list(service)?.into_iter().map(|(a, _)| a).collect())
        }
        fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String> {
            if account == "locked:x" {
                return Err("The user name or passphrase you entered is not correct.".into());
            }
            self.0
                .borrow_mut()
                .insert((service.into(), account.into()), value.into());
            Ok(())
        }
        fn remove(&self, service: &str, account: &str) -> Result<(), String> {
            self.0
                .borrow_mut()
                .remove(&(service.into(), account.into()));
            Ok(())
        }
    }

    fn ask(keychain: &Fake, request: Value) -> Value {
        let line = format!("{PREFIX}{request}");
        serde_json::from_str(&answer(&line, keychain).expect("an answer")).unwrap()
    }

    #[test]
    fn set_list_and_remove_go_to_the_apps_own_service() {
        let keychain = Fake::default();
        let value = "a \"quoted\" value\\ with\ttab, é and \u{1F642}";
        let reply = ask(
            &keychain,
            json!({"id": 1, "op": "set", "account": "github:token", "value": value}),
        );
        assert_eq!(reply, json!({"id": 1, "ok": true}));
        assert_eq!(
            keychain.list(SERVICE).unwrap(),
            vec![("github:token".into(), value.into())]
        );
        let reply = ask(&keychain, json!({"id": 2, "op": "list"}));
        assert_eq!(
            reply,
            json!({"id": 2, "ok": true, "secrets": {"github:token": value}})
        );
        let reply = ask(
            &keychain,
            json!({"id": 3, "op": "remove", "account": "github:token"}),
        );
        assert_eq!(reply, json!({"id": 3, "ok": true}));
        assert!(keychain.list(SERVICE).unwrap().is_empty());
    }

    #[test]
    fn legacy_lists_the_old_services_accounts_and_no_values() {
        let keychain = Fake::default();
        keychain
            .set(LEGACY_SERVICE, "anthropic:API_KEY", "sk-old")
            .unwrap();
        keychain.set(SERVICE, "github:token", "new").unwrap();
        let reply = ask(&keychain, json!({"id": 7, "op": "legacy"}));
        assert_eq!(
            reply,
            json!({"id": 7, "ok": true, "accounts": ["anthropic:API_KEY"]})
        );
        assert!(!reply.to_string().contains("sk-old"));
    }

    #[test]
    fn a_failure_comes_back_under_its_id() {
        let keychain = Fake::default();
        let reply = ask(
            &keychain,
            json!({"id": 4, "op": "set", "account": "locked:x", "value": "v"}),
        );
        assert_eq!(reply["id"], 4);
        assert_eq!(reply["ok"], false);
        assert!(reply["error"].as_str().unwrap().contains("passphrase"));
    }

    #[test]
    fn a_bad_request_with_an_id_gets_an_error_and_one_without_gets_nothing() {
        let keychain = Fake::default();
        assert_eq!(
            ask(&keychain, json!({"id": 5, "op": "steal"})),
            json!({"id": 5, "ok": false, "error": "unknown op"})
        );
        assert_eq!(
            ask(&keychain, json!({"id": 6, "op": "set", "value": "v"})),
            json!({"id": 6, "ok": false, "error": "no account"})
        );
        assert_eq!(
            ask(&keychain, json!({"id": 8, "op": "set", "account": "a:b"})),
            json!({"id": 8, "ok": false, "error": "no value"})
        );
        assert_eq!(
            answer(&format!("{PREFIX}{{\"op\":\"list\"}}"), &keychain),
            None
        );
        assert_eq!(answer(&format!("{PREFIX}{{\"id\":9,"), &keychain), None);
        assert_eq!(answer("oddboro:notify hi", &keychain), None);
    }

    #[test]
    fn parse_reads_each_op() {
        assert_eq!(
            parse(&format!("{PREFIX}{{\"id\":1,\"op\":\"list\"}}")),
            Ok((1, Op::List))
        );
        assert_eq!(
            parse(&format!(
                "{PREFIX}{{\"id\":2,\"op\":\"remove\",\"account\":\"a:b\"}}"
            )),
            Ok((
                2,
                Op::Remove {
                    account: "a:b".into()
                }
            ))
        );
        assert_eq!(parse("oddboro:secret"), Err((None, "not a request")));
    }

    #[test]
    fn every_line_with_the_mark_is_private() {
        assert!(private(
            r#"oddboro:secret {"id":1,"op":"set","account":"a","value":"v"}"#
        ));
        assert!(private("oddboro:secret not json"));
        assert!(private("oddboro:secret"));
        assert!(private(r#"some log textoddboro:secret {"id":1,"#));
        assert!(!private("oddboro:notify Title\tText"));
        assert!(!private("listening on 127.0.0.1:4500"));
    }
}
