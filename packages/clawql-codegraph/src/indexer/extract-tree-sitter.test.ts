import { describe, expect, it } from "vitest";
import {
  extractWithTreeSitter,
  resolveTreeSitterLanguage,
  supportedTreeSitterLanguages,
} from "./extract-tree-sitter.js";

describe("extractWithTreeSitter", () => {
  it("registers a broad language set", () => {
    const langs = supportedTreeSitterLanguages();
    expect(langs).toContain("python");
    expect(langs).toContain("rust");
    expect(langs).toContain("java");
    expect(langs).toContain("ruby");
    expect(langs.length).toBeGreaterThanOrEqual(25);
    expect(resolveTreeSitterLanguage("src/main.rs")).toBe("rust");
    expect(resolveTreeSitterLanguage("App.kt")).toBe("kotlin");
  });

  it("extracts Python functions and imports", async () => {
    const source = `
import os

def authenticate(user: str) -> bool:
    return os.path.exists(user)

class UserService:
    def login(self):
        authenticate("x")
`;
    const result = await extractWithTreeSitter("python", "auth.py", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("authenticate");
    expect(names).toContain("UserService");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });

  it("extracts Go functions and imports", async () => {
    const source = `
package main

import "fmt"

func Authenticate(user string) bool {
    fmt.Println(user)
    return true
}
`;
    const result = await extractWithTreeSitter("go", "auth.go", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("Authenticate");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });

  it("extracts Rust functions, structs, and use", async () => {
    const source = `
use std::io;

pub struct User { name: String }

pub fn authenticate(user: &str) -> bool {
    io::stdout();
    true
}

impl User {
    pub fn login(&self) {
        authenticate(&self.name);
    }
}
`;
    const result = await extractWithTreeSitter("rust", "auth.rs", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("authenticate");
    expect(names).toContain("User");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
    expect(result.edges.some((e) => e.kind === "calls")).toBe(true);
  });

  it("extracts Java classes, methods, and imports", async () => {
    const source = `
import java.util.List;

public class UserService {
  public boolean authenticate(String user) {
    return helper(user);
  }
  private boolean helper(String user) { return true; }
}
`;
    const result = await extractWithTreeSitter("java", "UserService.java", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("UserService");
    expect(names).toContain("authenticate");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });

  it("extracts Ruby methods and require", async () => {
    const source = `
require "json"

class UserService
  def authenticate(user)
    helper(user)
  end
  def helper(user)
    true
  end
end
`;
    const result = await extractWithTreeSitter("ruby", "user_service.rb", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("UserService");
    expect(names).toContain("authenticate");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });

  it("extracts C# classes and usings", async () => {
    const source = `
using System;

namespace Demo {
  public class Auth {
    public bool Authenticate(string user) {
      return Helper(user);
    }
    bool Helper(string user) => true;
  }
}
`;
    const result = await extractWithTreeSitter("c_sharp", "Auth.cs", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("Auth");
    expect(names).toContain("Authenticate");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });
});
