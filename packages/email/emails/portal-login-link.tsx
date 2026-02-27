import {
  Body,
  Container,
  Heading,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { Logo } from "../components/logo";
import {
  Button,
  EmailThemeProvider,
  getEmailInlineStyles,
  getEmailThemeClasses,
} from "../components/theme";

interface Props {
  email?: string;
  teamName?: string;
  customerName?: string;
  portalUrl?: string;
}

export const PortalLoginLinkEmail = ({
  email = "client@example.com",
  teamName = "Connor & Co",
  customerName = "there",
  portalUrl = "https://app.connorco.dev/client",
}: Props) => {
  const themeClasses = getEmailThemeClasses();
  const lightStyles = getEmailInlineStyles("light");

  return (
    <EmailThemeProvider
      preview={<Preview>Your secure client portal sign-in link</Preview>}
    >
      <Body
        className={`my-auto mx-auto font-sans ${themeClasses.body}`}
        style={lightStyles.body}
      >
        <Container
          className={`my-[40px] mx-auto p-[20px] max-w-[600px] ${themeClasses.container}`}
          style={{
            borderStyle: "solid",
            borderWidth: 1,
            borderColor: lightStyles.container.borderColor,
          }}
        >
          <Logo />

          <Heading
            className={`mx-0 my-[30px] p-0 text-[24px] font-normal text-center ${themeClasses.heading}`}
            style={{ color: lightStyles.text.color }}
          >
            Sign in to your client portal
          </Heading>

          <Text
            className={`text-[14px] leading-[24px] ${themeClasses.text}`}
            style={{ color: lightStyles.text.color }}
          >
            Hi {customerName},
          </Text>

          <Text
            className={`text-[14px] leading-[24px] ${themeClasses.text}`}
            style={{ color: lightStyles.text.color }}
          >
            We set up your secure portal with <strong>{teamName}</strong>. Use
            the link below to sign in instantly.
          </Text>

          <Section className="mb-[32px] mt-[32px] text-center">
            <Button href={portalUrl}>Access your portal</Button>
          </Section>

          <Section>
            <Text
              className={`text-[12px] leading-[24px] ${themeClasses.mutedText}`}
              style={{ color: lightStyles.mutedText.color }}
            >
              This sign-in link was requested for{" "}
              <span
                className={themeClasses.text}
                style={{ color: lightStyles.text.color }}
              >
                {email}
              </span>
              . If this was not you, you can safely ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </EmailThemeProvider>
  );
};

export default PortalLoginLinkEmail;
