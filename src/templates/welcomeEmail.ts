import { escapeHtml } from "../utils/htmlSanitizer";

export function welcomeEmail(
  name: string,
  email: string,
  password: string
) {
  return `
    <h2>Welcome to Complify Support</h2>

    <p>Hello <b>${escapeHtml(name)}</b>,</p>

    <p>Your account has been created successfully.</p>

    <table>
      <tr>
        <td><b>Email</b></td>
        <td>${escapeHtml(email)}</td>
      </tr>

      <tr>
        <td><b>Password</b></td>
        <td>${escapeHtml(password)}</td>
      </tr>
    </table>

    <br/>

    <p>Please change your password after your first login.</p>

    <hr/>

    <small>Complify Support System</small>
  `;
}