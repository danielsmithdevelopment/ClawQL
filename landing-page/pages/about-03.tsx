import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import { YouTubeIcon } from '@/components/icons/social/youtube-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import {
  FooterLink,
  FooterWithLinksAndSocialIcons,
  SocialLink,
} from '@/components/sections/footer-with-links-and-social-icons'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLogoActionsAndLeftAlignedLinks,
} from '@/components/sections/navbar-with-logo-actions-and-left-aligned-links'
import { Stat, StatsThreeColumnWithDescription } from '@/components/sections/stats-three-column-with-description'
import { TeamFourColumnGrid, TeamMember } from '@/components/sections/team-four-column-grid'
import { TestimonialLargeQuote } from '@/components/sections/testimonial-with-large-quote'

export default function Page() {
  return (
    <>
      <NavbarWithLogoActionsAndLeftAlignedLinks
        id="navbar"
        logo={
          <NavbarLogo href="#">
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=mist-950"
              alt="Oatmeal"
              className="dark:hidden"
              width={113}
              height={28}
            />
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=white"
              alt="Oatmeal"
              className="not-dark:hidden"
              width={113}
              height={28}
            />
          </NavbarLogo>
        }
        links={
          <>
            <NavbarLink href="#">Pricing</NavbarLink>
            <NavbarLink href="#">About</NavbarLink>
            <NavbarLink href="#">Docs</NavbarLink>
            <NavbarLink href="#" className="sm:hidden">
              Log in
            </NavbarLink>
          </>
        }
        actions={
          <>
            <PlainButtonLink href="#" className="max-sm:hidden">
              Log in
            </PlainButtonLink>
            <ButtonLink href="#">Get started</ButtonLink>
          </>
        }
      />

      <Main>
        {/* Hero */}
        <HeroSimpleCentered
          id="hero"
          headline="Your customer success is our mission."
          subheadline={
            <p>
              Simplify your shared inbox, collaborate effortlessly, and give every customer a reply that feels personal,
              even if it was written by a bot.
            </p>
          }
        />

        {/* Stats */}
        <StatsThreeColumnWithDescription
          id="stats"
          heading="About Oatmeal"
          description={
            <>
              <p>
                Oatmeal was founded on the belief that customer support should be personal, fast, and most importantly,
                highly profitable.
              </p>
              <p>
                The problem with traditional AI customer support tools is that they often lack the human touch that
                customers crave. At Oatmeal, we combine the power of AI with a massive network of low wage workers
                stationed around the globe to deliver customer support that feels personal and authentic.
              </p>
              <p>
                Oatmeal's competitive advantage lies in the fact that we can undercut our competitors who rely on
                expensive hardware based compute. Our network of human based compute centers allows us to provide
                high-quality customer support at a fraction of the cost. Compared to data centers that consume massive
                amounts of electricity and water, our approach is both sustainable and cost effective.
              </p>
            </>
          }
        >
          <Stat stat="2M+" text="Emails manually processed every week across thousands of teams." />
          <Stat stat="99.98%" text="Uptime — because your customers never stop complaining." />
          <Stat stat="70+" text="Countries where we have low wage workers pretending to be AI." />
        </StatsThreeColumnWithDescription>

        {/* Testimonial */}
        <TestimonialLargeQuote
          id="testimonial"
          quote={
            <p>
              Oatmeal has completely transformed our customer support operations. The blend of AI efficiency and human
              empathy has allowed us to provide exceptional service while significantly reducing costs.
            </p>
          }
          img={
            <img
              src="https://assets.tailwindplus.com/avatars/10.webp?size=160"
              alt=""
              className="not-dark:bg-white/75 dark:bg-black/75"
              width={160}
              height={160}
            />
          }
          name="Jordan Rogers"
          byline="Founder at Anomaly"
        />

        {/* Team */}
        <TeamFourColumnGrid
          id="team"
          headline="Our leadership team"
          subheadline={
            <p>
              Oatmeals's leadership team combines decades of experience in private equity, where they honed their skills
              in cost-cutting and maximizing shareholder value.
            </p>
          }
        >
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/1.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Leslie Alexander"
            byline="Co-Founder / CEO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/2.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Michael Foster"
            byline="Co-Founder / CTO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/7.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Dries Vincent"
            byline="Business Relations"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/4.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Lindsay Walton"
            byline="Front-end Developer"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/5.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Noor Hasan"
            byline="Designer"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/6.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Tom Cook"
            byline="Director of Product"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/8.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Whitney Francis"
            byline="Copywriter"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/3.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Leonard Wu"
            byline="Senior Designer"
          />
        </TeamFourColumnGrid>

        {/* Call To Action */}
        <CallToActionSimpleCentered
          id="call-to-action"
          headline="Have anymore questions?"
          subheadline={
            <p>Chat to someone on our sales team, who will make promises about our roadmap that we won't keep.</p>
          }
          cta={
            <div className="flex items-center gap-4">
              <ButtonLink href="#" size="lg">
                Chat with us
              </ButtonLink>

              <PlainButtonLink href="#" size="lg">
                Book a demo <ChevronIcon />
              </PlainButtonLink>
            </div>
          }
        />
      </Main>

      <FooterWithLinksAndSocialIcons
        id="footer"
        links={
          <>
            <FooterLink href="#">About</FooterLink>
            <FooterLink href="#">Careers</FooterLink>
            <FooterLink href="#">Blog</FooterLink>
            <FooterLink href="#">Help Center</FooterLink>
            <FooterLink href="#">Press Kit</FooterLink>
            <FooterLink href="#">Privacy Policy</FooterLink>
          </>
        }
        socialLinks={
          <>
            <SocialLink href="https://x.com" name="X">
              <XIcon />
            </SocialLink>
            <SocialLink href="https://github.com" name="GitHub">
              <GitHubIcon />
            </SocialLink>
            <SocialLink href="https://www.youtube.com" name="YouTube">
              <YouTubeIcon />
            </SocialLink>
          </>
        }
        fineprint="© 2025 Oatmeal, Inc."
      />
    </>
  )
}
